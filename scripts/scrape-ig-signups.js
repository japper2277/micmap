#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Instagram signup ingestion (stories first, optional post fallback).
 *
 * This is the new primary pipeline. It requires a persistent logged-in
 * Chrome DevTools session and produces the same report contract as the
 * legacy scraper so downstream apply/review scripts continue to work.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../api/.env') });

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  connectToRemoteBrowser,
  createWorkerPage,
  ensureInstagramLoggedIn
} = require('./lib/ig-browser-session');
const { captureRecentPostsFallback } = require('./lib/ig-post-fallback');
const { runStoryAccount } = require('./lib/ig-story-runner');
const { matchMicFromWatchlist } = require('./lib/ig-mic-matcher');
const { classifyIgCandidate } = require('./lib/ig-change-classifier');
const {
  estimateConfidence,
  extractJsonFromModelText,
  normalizeAnalysis
} = require('./lib/ig-model-parse');
const { inferContext } = require('./lib/ig-context-inference');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_REPORT_PATH = path.join(__dirname, '../logs/ig-stories-report.json');
const DEFAULT_DIAGNOSTICS_DIR = path.join(__dirname, '../logs');
const WATCHLIST_PATH = path.join(__dirname, './config/ig-watchlist.json');
const MICS_PATH = path.join(__dirname, '../api/mics.json');

const STORY_PROMPT = `You are analyzing an Instagram story screenshot or post screenshot from a comedy venue/host.

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

function parseArgs(argv) {
  const out = {
    account: null,
    dryRun: false,
    reportPath: DEFAULT_REPORT_PATH,
    remoteDebugUrl: process.env.CHROME_REMOTE_DEBUG_URL || null,
    maxFrames: 10,
    diagnosticsDir: DEFAULT_DIAGNOSTICS_DIR,
    postsFallback: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--account' && argv[i + 1]) out.account = argv[++i];
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--report' && argv[i + 1]) out.reportPath = path.resolve(argv[++i]);
    else if (arg === '--remote-debug-url' && argv[i + 1]) out.remoteDebugUrl = argv[++i];
    else if (arg === '--max-frames' && argv[i + 1]) out.maxFrames = Math.max(1, Number(argv[++i]) || 10);
    else if (arg === '--diagnostics-dir' && argv[i + 1]) out.diagnosticsDir = path.resolve(argv[++i]);
    else if (arg === '--posts-fallback') out.postsFallback = true;
  }

  return out;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadWatchlist(account) {
  const watchlist = loadJson(WATCHLIST_PATH);
  if (!Array.isArray(watchlist) || watchlist.length === 0) {
    throw new Error('Watchlist file must be a non-empty JSON array');
  }

  return account ? watchlist.filter((entry) => entry.handle === account) : watchlist;
}

function toMatchedMicRef(match) {
  if (!match) return null;
  return {
    index: match.index,
    method: match.method,
    name: match.mic.name,
    day: match.mic.day,
    startTime: match.mic.startTime,
    venueName: match.mic.venueName,
    host: match.mic.host || null
  };
}

function buildSummary(entries) {
  const summary = {
    total: entries.length,
    signupCandidates: 0,
    safeWrite: 0,
    reviewRequired: 0,
    ignored: 0
  };

  for (const entry of entries) {
    if (entry.analysis?.isSignup) summary.signupCandidates += 1;
    if (entry.classification === 'safe_write') summary.safeWrite += 1;
    else if (entry.classification === 'review_required') summary.reviewRequired += 1;
    else summary.ignored += 1;
  }

  return summary;
}

async function analyzeWithGemini(imagePath) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
  const imageData = fs.readFileSync(imagePath).toString('base64');
  const response = await model.generateContent([
    { text: STORY_PROMPT },
    { inlineData: { mimeType: 'image/png', data: imageData } }
  ]);
  return extractJsonFromModelText(response.response.text());
}

async function buildEntriesFromCaptures(captures, watchEntry, mics) {
  const entries = [];

  for (let index = 0; index < captures.length; index += 1) {
    const capture = captures[index];
    console.log(`Analyzing ${capture.source} frame ${index + 1}/${captures.length}`);

    let analysisRaw = null;
    try {
      analysisRaw = await analyzeWithGemini(capture.screenshotPath);
    } catch (error) {
      console.error(`Gemini analysis failed for ${capture.screenshotPath}: ${error.message}`);
    }

    const analysisNorm = normalizeAnalysis(analysisRaw);
    const { enrichedAnalysis: analysis, inferences } = inferContext(
      analysisNorm,
      watchEntry,
      new Date()
    );
    const confidence = estimateConfidence(analysis);
    const matched = matchMicFromWatchlist(mics, watchEntry, analysis);
    const classified = classifyIgCandidate({
      analysis,
      matchedMic: matched ? matched.mic : null,
      handle: watchEntry.handle,
      source: capture.source,
      postUrl: capture.postUrl
    });

    entries.push({
      source: capture.source,
      handle: watchEntry.handle,
      postUrl: capture.postUrl || null,
      screenshotPath: capture.screenshotPath,
      analysis,
      inferences,
      confidence,
      classification: classified.classification,
      matchedMicRef: toMatchedMicRef(matched),
      candidateFields: classified.candidateFields,
      safeChanges: classified.safeChanges,
      riskyChanges: classified.riskyChanges,
      reasons: classified.reasons
    });
  }

  return entries;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const watchlist = loadWatchlist(args.account);
  if (!watchlist.length) {
    throw new Error(args.account
      ? `Account not found in watchlist: ${args.account}`
      : 'Watchlist resolved to zero accounts');
  }

  const mics = loadJson(MICS_PATH);
  const browser = await connectToRemoteBrowser(puppeteer, args.remoteDebugUrl);
  const entries = [];

  try {
    await ensureInstagramLoggedIn(browser);

    for (const watchEntry of watchlist) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Scanning @${watchEntry.handle}`);

      const storyResult = await runStoryAccount(browser, {
        handle: watchEntry.handle,
        createWorkerPage,
        diagnosticsDir: args.diagnosticsDir,
        maxFrames: args.maxFrames
      });

      let captures = storyResult.captures;
      if (!captures.length && args.postsFallback) {
        console.log(`No valid stories for @${watchEntry.handle}; falling back to recent posts...`);
        captures = await captureRecentPostsFallback(browser, watchEntry.handle, args.diagnosticsDir, 3);
      } else if (!captures.length) {
        console.log(`No valid stories for @${watchEntry.handle}; diagnostics: ${storyResult.diagnosticsPath}`);
      }

      if (!captures.length) continue;

      const nextEntries = await buildEntriesFromCaptures(captures, watchEntry, mics);
      entries.push(...nextEntries);
    }
  } finally {
    browser.disconnect();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    watchlistAccounts: watchlist.map((entry) => entry.handle),
    entries,
    summary: buildSummary(entries)
  };

  fs.mkdirSync(path.dirname(args.reportPath), { recursive: true });
  fs.writeFileSync(args.reportPath, JSON.stringify(report, null, 2));

  console.log(`\nReport written: ${args.reportPath}`);
  console.log(`Summary: ${JSON.stringify(report.summary)}`);
  console.log('Next: node scripts/apply-ig-signups.js --report <path> --dry-run');
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
});
