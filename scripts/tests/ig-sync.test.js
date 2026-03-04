const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractJsonFromModelText,
  normalizeAnalysis,
  estimateConfidence
} = require('../lib/ig-model-parse');
const { matchMicFromWatchlist } = require('../lib/ig-mic-matcher');
const { classifyIgCandidate } = require('../lib/ig-change-classifier');
const { applyEntryToMic } = require('../apply-ig-signups');

test('extractJsonFromModelText parses plain and fenced JSON', () => {
  const plain = extractJsonFromModelText('{"isSignup":true,"micName":"Fear City"}');
  assert.equal(plain.isSignup, true);
  assert.equal(plain.micName, 'Fear City');

  const fenced = extractJsonFromModelText('Here\n```json\n{"isSignup":false}\n```\nThanks');
  assert.equal(fenced.isSignup, false);

  const malformed = extractJsonFromModelText('not json at all');
  assert.equal(malformed, null);
});

test('normalizeAnalysis + estimateConfidence handle signup payload', () => {
  const normalized = normalizeAnalysis({
    isSignup: true,
    micName: ' Fun Mug ',
    day: 'Friday',
    time: '6:00 PM',
    venueName: 'Fear City',
    signupUrl: 'https://example.com/form'
  });

  assert.equal(normalized.micName, 'Fun Mug');
  assert.equal(normalized.signupUrl, 'https://example.com/form');
  assert.ok(estimateConfidence(normalized) >= 0.7);
});

test('matchMicFromWatchlist prefers selector exact match', () => {
  const mics = [{
    name: '*6 or 11* Fun Mug RIFF Mic',
    day: 'Friday',
    startTime: '6:00 PM',
    venueName: 'The Fear City Comedy Club',
    host: '@thefearcitycomedyclub'
  }];

  const watchEntry = {
    handle: 'thefearcitycomedyclub',
    micSelectors: [{
      name: '*6 or 11* Fun Mug RIFF Mic',
      day: 'Friday',
      startTime: '6:00 PM',
      venueName: 'The Fear City Comedy Club',
      host: '@thefearcitycomedyclub'
    }]
  };

  const match = matchMicFromWatchlist(mics, watchEntry, null);
  assert.equal(match.method, 'selector_exact');
  assert.equal(match.index, 0);
});

test('matchMicFromWatchlist falls back to host+venue', () => {
  const mics = [{
    name: 'Fear City Mic',
    day: 'Friday',
    startTime: '10:00 PM',
    venueName: 'The Fear City Comedy Club',
    host: '@thefearcitycomedyclub'
  }];

  const watchEntry = {
    handle: 'thefearcitycomedyclub',
    micSelectors: [{ venueName: 'The Fear City Comedy Club' }]
  };

  const match = matchMicFromWatchlist(mics, watchEntry, { venueName: 'The Fear City Comedy Club' });
  assert.equal(match.method, 'host_venue_fallback');
  assert.equal(match.index, 0);
});

test('classifyIgCandidate marks signup-only diffs as safe_write', () => {
  const matchedMic = {
    name: '*6 or 11* Fun Mug RIFF Mic',
    day: 'Friday',
    startTime: '6:00 PM',
    venueName: 'The Fear City Comedy Club',
    signUpDetails: 'Sign up in person',
    host: '@thefearcitycomedyclub',
    cost: '$5',
    stageTime: '5min'
  };

  const analysis = {
    isSignup: true,
    micName: '*6 or 11* Fun Mug RIFF Mic',
    day: 'Friday',
    time: '6:00 PM',
    venueName: 'The Fear City Comedy Club',
    signupInstructions: 'Comment on IG @thefearcitycomedyclub',
    signupUrl: null
  };

  const out = classifyIgCandidate({
    analysis,
    matchedMic,
    handle: 'thefearcitycomedyclub',
    source: 'story',
    postUrl: null
  });

  assert.equal(out.classification, 'safe_write');
  assert.equal(out.riskyChanges.length, 0);
  assert.ok(out.safeChanges.some((c) => c.field === 'signUpDetails'));
});

test('classifyIgCandidate marks schedule diffs as review_required', () => {
  const matchedMic = {
    name: '*6 or 11* Fun Mug RIFF Mic',
    day: 'Friday',
    startTime: '6:00 PM',
    venueName: 'The Fear City Comedy Club',
    signUpDetails: 'Sign up in person',
    host: '@thefearcitycomedyclub'
  };

  const analysis = {
    isSignup: true,
    micName: '*6 or 11* Fun Mug RIFF Mic',
    day: 'Friday',
    time: '7:00 PM',
    venueName: 'The Fear City Comedy Club',
    signupInstructions: 'Comment below'
  };

  const out = classifyIgCandidate({
    analysis,
    matchedMic,
    handle: 'thefearcitycomedyclub',
    source: 'story',
    postUrl: null
  });

  assert.equal(out.classification, 'review_required');
  assert.ok(out.riskyChanges.some((c) => c.field === 'startTime'));
});

test('applyEntryToMic is idempotent for notes/signUpDetails', () => {
  const mic = {
    signUpDetails: 'Sign up in person',
    notes: null
  };

  const entry = {
    candidateFields: {
      signUpDetails: 'Comment on IG @thefearcitycomedyclub',
      notesLine: '[IG sync 2026-03-04] @thefearcitycomedyclub story'
    }
  };

  const first = applyEntryToMic(mic, entry);
  assert.ok(first.length >= 1);

  const second = applyEntryToMic(mic, entry);
  assert.equal(second.length, 0);
});
