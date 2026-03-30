const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifySurface,
  extractVisibleStoryHandle
} = require('../lib/ig-story-state');
const { computeStoryViewerClip } = require('../lib/ig-story-capture');
const { runStoryStateMachine } = require('../lib/ig-story-runner');

test('extractVisibleStoryHandle prefers exact target handle in top candidates', () => {
  const snapshot = {
    handleCandidates: [
      { handle: 'someoneelse', source: 'text', top: 12, left: 80 },
      { handle: 'phoenixcomedynyc', source: 'href', top: 18, left: 88 },
      { handle: 'phoenixcomedybackup', source: 'text', top: 25, left: 84 }
    ]
  };

  assert.equal(extractVisibleStoryHandle(snapshot, 'phoenixcomedynyc'), 'phoenixcomedynyc');
});

test('classifySurface returns consent_prompt for target handle view story gate', () => {
  const snapshot = {
    url: 'https://www.instagram.com/stories/phoenixcomedynyc/',
    bodyText: 'phoenixcomedynyc View as jaredapper? View story',
    hasViewStoryPrompt: true,
    handleCandidates: [
      { handle: 'phoenixcomedynyc', source: 'text', top: 12, left: 84 }
    ]
  };

  const state = classifySurface(snapshot, 'phoenixcomedynyc');
  assert.equal(state.state, 'consent_prompt');
  assert.equal(state.visibleHandle, 'phoenixcomedynyc');
});

test('classifySurface returns target_story for matching visible handle with story controls', () => {
  const snapshot = {
    url: 'https://www.instagram.com/',
    bodyText: 'phoenixcomedynyc Reply to phoenixcomedynyc...',
    hasPause: true,
    hasReplyInput: true,
    handleCandidates: [
      { handle: 'phoenixcomedynyc', source: 'href', top: 14, left: 92 }
    ]
  };

  const state = classifySurface(snapshot, 'phoenixcomedynyc');
  assert.equal(state.state, 'target_story');
});

test('classifySurface returns wrong_story when visible handle differs', () => {
  const snapshot = {
    url: 'https://www.instagram.com/',
    bodyText: 'austinisaboringname Reply to austinisaboringname...',
    hasPlay: true,
    handleCandidates: [
      { handle: 'austinisaboringname', source: 'text', top: 16, left: 90 }
    ]
  };

  const state = classifySurface(snapshot, 'phoenixcomedynyc');
  assert.equal(state.state, 'wrong_story');
  assert.equal(state.visibleHandle, 'austinisaboringname');
});

test('computeStoryViewerClip returns a crop for a valid target viewer candidate', () => {
  const clip = computeStoryViewerClip({
    viewport: { width: 1280, height: 900 },
    candidates: [{
      x: 420,
      y: 36,
      width: 430,
      height: 780,
      hasTargetHandle: true,
      hasControls: true,
      hasReplyInput: true,
      hasMedia: true,
      visibleHandle: 'phoenixcomedynyc'
    }]
  }, 'phoenixcomedynyc');

  assert.ok(clip);
  assert.ok(clip.width > 0);
  assert.ok(clip.height > 0);
});

test('computeStoryViewerClip rejects feed-like candidates without target handle', () => {
  const clip = computeStoryViewerClip({
    viewport: { width: 1280, height: 900 },
    candidates: [{
      x: 100,
      y: 120,
      width: 600,
      height: 500,
      hasTargetHandle: false,
      hasControls: false,
      hasReplyInput: false,
      hasMedia: true,
      visibleHandle: null
    }]
  }, 'phoenixcomedynyc');

  assert.equal(clip, null);
});

test('runStoryStateMachine captures frame 0 after consent prompt', async () => {
  const transitions = [
    { state: 'consent_prompt', visibleHandle: 'phoenixcomedynyc' },
    { state: 'target_story', visibleHandle: 'phoenixcomedynyc' },
    { state: 'profile', visibleHandle: null }
  ];
  const actions = [];
  let navigateCount = 0;
  let failureSaves = 0;
  const frameIndexes = [];

  const result = await runStoryStateMachine({
    navigateToStory: async () => { navigateCount += 1; },
    pollState: async () => transitions.shift(),
    clickViewStory: async () => true,
    captureFrame: async (frameIndex) => {
      frameIndexes.push(frameIndex);
      return {
        capture: { source: 'story', postUrl: null, screenshotPath: `/tmp/frame-${frameIndex}.png` },
        frameHash: 'abc'
      };
    },
    advanceFrame: async () => {},
    saveFailureArtifact: async () => { failureSaves += 1; },
    recordAction: (action) => actions.push(action),
    recordTransition: () => {}
  }, {
    handle: 'phoenixcomedynyc',
    maxFrames: 10
  });

  assert.equal(result.failureReason, null);
  assert.equal(result.captures.length, 1);
  assert.deepEqual(frameIndexes, [0]);
  assert.equal(navigateCount, 1);
  assert.equal(failureSaves, 0);
  assert.ok(actions.includes('view_story_clicked'));
});

test('runStoryStateMachine retries direct story URL after consent bounce to feed', async () => {
  const transitions = [
    { state: 'consent_prompt', visibleHandle: 'phoenixcomedynyc' },
    { state: 'feed', visibleHandle: null },
    { state: 'target_story', visibleHandle: 'phoenixcomedynyc' },
    { state: 'profile', visibleHandle: null }
  ];
  let navigateCount = 0;

  const result = await runStoryStateMachine({
    navigateToStory: async () => { navigateCount += 1; },
    pollState: async () => transitions.shift(),
    clickViewStory: async () => true,
    captureFrame: async () => ({
      capture: { source: 'story', postUrl: null, screenshotPath: '/tmp/frame-0.png' },
      frameHash: 'xyz'
    }),
    advanceFrame: async () => {},
    saveFailureArtifact: async () => {},
    recordAction: () => {},
    recordTransition: () => {}
  }, {
    handle: 'phoenixcomedynyc',
    maxFrames: 10
  });

  assert.equal(result.failureReason, null);
  assert.equal(result.captures.length, 1);
  assert.equal(navigateCount, 2);
});

test('runStoryStateMachine fails when wrong story persists after retry', async () => {
  const transitions = [
    { state: 'wrong_story', visibleHandle: 'somebodyelse' },
    { state: 'wrong_story', visibleHandle: 'somebodyelse' }
  ];
  let failureLabelCount = 0;

  const result = await runStoryStateMachine({
    navigateToStory: async () => {},
    pollState: async () => transitions.shift(),
    clickViewStory: async () => false,
    captureFrame: async () => null,
    advanceFrame: async () => {},
    saveFailureArtifact: async () => { failureLabelCount += 1; },
    recordAction: () => {},
    recordTransition: () => {}
  }, {
    handle: 'phoenixcomedynyc',
    maxFrames: 10
  });

  assert.equal(result.captures.length, 0);
  assert.equal(result.failureReason, 'resolve_wrong_story');
  assert.equal(failureLabelCount, 1);
});
