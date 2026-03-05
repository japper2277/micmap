const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { redis, isRedisConnected } = require('../config/cache');
const Mic = require('../models/Mic');
const { invalidateMicsCache } = require('../utils/cache-invalidation');

// Reuse IG pipeline libs (paths relative to api/)
const { normalizeAnalysis, extractJsonFromModelText, estimateConfidence } = require('../../scripts/lib/ig-model-parse');
const { matchMicFromWatchlist } = require('../../scripts/lib/ig-mic-matcher');
const { classifyIgCandidate } = require('../../scripts/lib/ig-change-classifier');

const REDIS_TTL = 30 * 24 * 60 * 60; // 30 days
const CONFIDENCE_THRESHOLD = 0.85;

const FB_TEXT_PROMPT = `You are analyzing a Facebook group post from a NYC comedy open mic community.

Extract the signup event details for open mic data quality.

Return STRICT JSON only:
{
  "isSignup": true/false,
  "micName": "string or null",
  "day": "Monday|Tuesday|... or null",
  "date": "YYYY-MM-DD or null",
  "time": "e.g. 6:00 PM or null",
  "venueName": "string or null",
  "signupInstructions": "string or null",
  "signupUrl": "https://... or null",
  "spotsLeft": "number or null",
  "capacity": "number or null",
  "host": "string or null",
  "cost": "string or null",
  "stageTime": "string or null",
  "notes": "string or null"
}

If not signup related, return {"isSignup": false} only.`;

async function analyzePostWithGemini(post) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

  const parts = [{ text: `${FB_TEXT_PROMPT}\n\nPost text:\n${post.text || ''}` }];

  // If the post has images, include them
  if (Array.isArray(post.images)) {
    for (const img of post.images) {
      if (img.base64 && img.mimeType) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
      }
    }
  }

  const response = await model.generateContent(parts);
  const text = response.response.text();
  return extractJsonFromModelText(text);
}

async function loadMicsFromDb() {
  const docs = await Mic.find({}).lean();
  return docs.map((d) => ({
    _id: d._id,
    name: d.name,
    day: d.day,
    startTime: d.startTime,
    venueName: d.venueName,
    host: d.host || null,
    signUpDetails: d.signUpDetails || null,
    cost: d.cost || null,
    stageTime: d.stageTime || null,
    notes: d.notes || null
  }));
}

async function processPost(post) {
  const postId = post.id || `fb_${Date.now()}`;
  const postUrl = post.url || post.link || null;

  // Store raw payload
  if (isRedisConnected()) {
    await redis.setex(`micmap:fb:raw:${postId}`, REDIS_TTL, JSON.stringify(post));
  }

  // Analyze with Gemini
  const rawAnalysis = await analyzePostWithGemini(post);
  const analysis = normalizeAnalysis(rawAnalysis);
  const confidence = estimateConfidence(analysis);

  // Match against existing mics
  const mics = await loadMicsFromDb();
  // No FB watchlist selectors — pass empty watchEntry so matcher uses analysis_exact and host_venue_fallback
  const match = analysis.isSignup
    ? matchMicFromWatchlist(mics, { micSelectors: [] }, analysis)
    : null;

  // Classify
  const classified = classifyIgCandidate({
    analysis,
    matchedMic: match?.mic || null,
    handle: null,
    source: 'post',
    postUrl,
    sourceType: 'fb_group'
  });

  const result = {
    postId,
    postUrl,
    postText: (post.text || '').slice(0, 500),
    analysis,
    confidence,
    matchMethod: match?.method || null,
    matchedMicId: match?.mic?._id?.toString() || null,
    matchedMicName: match?.mic?.name || null,
    classification: classified.classification,
    reasons: classified.reasons,
    safeChanges: classified.safeChanges,
    riskyChanges: classified.riskyChanges,
    candidateFields: classified.candidateFields,
    processedAt: new Date().toISOString()
  };

  // Store processed result
  if (isRedisConnected()) {
    await redis.setex(`micmap:fb:processed:${postId}`, REDIS_TTL, JSON.stringify(result));

    if (classified.classification === 'safe_write' && confidence >= CONFIDENCE_THRESHOLD) {
      await redis.lpush('micmap:fb:safe_queue', JSON.stringify(result));
    } else if (classified.classification === 'review_required') {
      await redis.lpush('micmap:fb:review_queue', JSON.stringify(result));
    }
  }

  // Save flyer image URL on matched mic
  if (match?.mic?._id && post.imageUrl) {
    try {
      await Mic.findByIdAndUpdate(match.mic._id, { $set: { flyerUrl: post.imageUrl } });
      result.flyerUrlSaved = true;
    } catch (err) {
      console.error(`[FB webhook] Failed to save flyerUrl for mic ${match.mic._id}: ${err.message}`);
    }
  }

  console.log(`[FB webhook] postId=${postId} classification=${classified.classification} confidence=${confidence} match=${match?.method || 'none'}${result.flyerUrlSaved ? ' flyerUrl=saved' : ''}`);
  return result;
}

async function getReviewQueue() {
  if (!isRedisConnected()) return [];
  const items = await redis.lrange('micmap:fb:review_queue', 0, -1);
  return items.map((item) => JSON.parse(item));
}

async function getSafeQueue() {
  if (!isRedisConnected()) return [];
  const items = await redis.lrange('micmap:fb:safe_queue', 0, -1);
  return items.map((item) => JSON.parse(item));
}

async function applyEntry(entry) {
  if (!entry.matchedMicId) {
    throw new Error('Cannot apply: no matched mic ID');
  }

  const mic = await Mic.findById(entry.matchedMicId);
  if (!mic) {
    throw new Error(`Mic not found: ${entry.matchedMicId}`);
  }

  const updates = {};
  const candidateSignUp = entry.candidateFields?.signUpDetails;
  if (candidateSignUp && candidateSignUp !== mic.signUpDetails) {
    updates.signUpDetails = candidateSignUp;
  }

  const notesLine = entry.candidateFields?.notesLine;
  if (notesLine) {
    const existing = mic.notes || '';
    if (!existing.includes(notesLine)) {
      updates.notes = existing ? `${existing}\n${notesLine}` : notesLine;
    }
  }

  if (Object.keys(updates).length === 0) {
    return { applied: false, reason: 'no effective changes' };
  }

  await Mic.findByIdAndUpdate(entry.matchedMicId, { $set: updates });
  await invalidateMicsCache();

  return { applied: true, updates, micId: entry.matchedMicId };
}

module.exports = {
  processPost,
  getReviewQueue,
  getSafeQueue,
  applyEntry,
  analyzePostWithGemini,
  CONFIDENCE_THRESHOLD
};
