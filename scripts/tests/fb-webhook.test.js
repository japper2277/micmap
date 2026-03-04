const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyIgCandidate, makeNotesLine } = require('../lib/ig-change-classifier');

test('makeNotesLine with sourceType fb_group formats as FB sync', () => {
  const line = makeNotesLine({
    analysis: { spotsLeft: 5, capacity: 10 },
    handle: null,
    source: 'post',
    postUrl: 'https://facebook.com/groups/nyccomedy/posts/123',
    sourceType: 'fb_group'
  });

  assert.match(line, /^\[FB sync \d{4}-\d{2}-\d{2}\] group post/);
  assert.match(line, /\(https:\/\/facebook\.com\/groups\/nyccomedy\/posts\/123\)/);
  assert.match(line, /spots 5\/10$/);
});

test('makeNotesLine without sourceType still formats as IG sync', () => {
  const line = makeNotesLine({
    analysis: {},
    handle: 'testhandle',
    source: 'story',
    postUrl: null
  });

  assert.match(line, /^\[IG sync \d{4}-\d{2}-\d{2}\] @testhandle story$/);
});

test('classifyIgCandidate with sourceType fb_group: unmatched post → review_required', () => {
  const analysis = {
    isSignup: true,
    micName: 'Comedy Cellar Open Mic',
    day: 'Tuesday',
    time: '8:00 PM',
    venueName: 'Comedy Cellar',
    signupUrl: 'https://slotted.co/cellar'
  };

  const out = classifyIgCandidate({
    analysis,
    matchedMic: null,
    handle: null,
    source: 'post',
    postUrl: 'https://facebook.com/groups/nyccomedy/posts/456',
    sourceType: 'fb_group'
  });

  assert.equal(out.classification, 'review_required');
  assert.ok(out.reasons.some((r) => r.includes('no matching mic')));
  assert.match(out.candidateFields.notesLine, /^\[FB sync/);
});

test('classifyIgCandidate with sourceType fb_group: matched + signup only → safe_write', () => {
  const matchedMic = {
    name: 'Comedy Cellar Open Mic',
    day: 'Tuesday',
    startTime: '8:00 PM',
    venueName: 'Comedy Cellar',
    signUpDetails: 'Sign up in person',
    host: 'Joe',
    cost: 'Free',
    stageTime: '5min'
  };

  const analysis = {
    isSignup: true,
    micName: 'Comedy Cellar Open Mic',
    day: 'Tuesday',
    time: '8:00 PM',
    venueName: 'Comedy Cellar',
    signupUrl: 'https://slotted.co/cellar'
  };

  const out = classifyIgCandidate({
    analysis,
    matchedMic,
    handle: null,
    source: 'post',
    postUrl: null,
    sourceType: 'fb_group'
  });

  assert.equal(out.classification, 'safe_write');
  assert.equal(out.riskyChanges.length, 0);
  assert.ok(out.safeChanges.some((c) => c.field === 'signUpDetails'));
  assert.match(out.candidateFields.notesLine, /^\[FB sync/);
});

test('classifyIgCandidate with sourceType fb_group: risky change uses FB label in reason', () => {
  const matchedMic = {
    name: 'Comedy Cellar Open Mic',
    day: 'Tuesday',
    startTime: '8:00 PM',
    venueName: 'Comedy Cellar',
    signUpDetails: null,
    host: 'Joe'
  };

  const analysis = {
    isSignup: true,
    micName: 'Comedy Cellar Open Mic',
    day: 'Tuesday',
    time: '9:00 PM',
    venueName: 'Comedy Cellar'
  };

  const out = classifyIgCandidate({
    analysis,
    matchedMic,
    handle: null,
    source: 'post',
    postUrl: null,
    sourceType: 'fb_group'
  });

  assert.equal(out.classification, 'review_required');
  const timeRisk = out.riskyChanges.find((c) => c.field === 'startTime');
  assert.ok(timeRisk);
  assert.match(timeRisk.reason, /FB group post/);
});
