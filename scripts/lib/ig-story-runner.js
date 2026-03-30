const path = require('path');

const { dismissCommonPopups, sleep } = require('./ig-browser-session');
const { captureValidatedStoryFrame } = require('./ig-story-capture');
const { pollStorySurface } = require('./ig-story-state');
const {
  createDiagnostics,
  recordAction,
  recordTransition,
  saveFailureScreenshot,
  setFailureReason,
  writeDiagnostics
} = require('./ig-story-diagnostics');

function buildStoryUrl(handle) {
  return `https://www.instagram.com/stories/${handle}/`;
}

async function clickViewStoryPrompt(page) {
  await sleep(1000);
  const clicked = await page.evaluate(() => {
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    for (const el of document.querySelectorAll('button, a, div[role="button"], span[role="button"]')) {
      const text = normalize(el.textContent);
      const aria = normalize(el.getAttribute('aria-label'));
      if (text === 'view story' || aria === 'view story') {
        el.click();
        return true;
      }
    }
    return false;
  });
  await sleep(1000);
  return clicked;
}

async function runStoryStateMachine(deps, options) {
  const {
    handle,
    maxFrames
  } = options;
  const {
    navigateToStory,
    pollState,
    clickViewStory,
    captureFrame,
    advanceFrame,
    saveFailureArtifact,
    recordAction: recordActionFn = () => {},
    recordTransition: recordTransitionFn = () => {}
  } = deps;

  let resolvedState = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await navigateToStory(attempt);
    resolvedState = await pollState(`navigate_${attempt}`, 12000);
    recordTransitionFn(`navigate_${attempt}`, resolvedState);

    if (resolvedState.state === 'login_required') {
      await saveFailureArtifact('login_required');
      return { captures: [], failureReason: 'login_required' };
    }

    if (resolvedState.state === 'target_story') {
      break;
    }

    if (resolvedState.state === 'consent_prompt') {
      recordActionFn('view_story_prompt_detected', { attempt });
      const clicked = await clickViewStory();
      recordActionFn(clicked ? 'view_story_clicked' : 'view_story_missing', { attempt });

      if (!clicked) {
        await saveFailureArtifact('view_story_missing');
        return { captures: [], failureReason: 'view_story_missing' };
      }

      resolvedState = await pollState(`post_consent_${attempt}`, 5000);
      recordTransitionFn(`post_consent_${attempt}`, resolvedState);

      if (resolvedState.state === 'target_story') {
        break;
      }

      if (attempt === 0 && ['feed', 'profile', 'wrong_story', 'unknown'].includes(resolvedState.state)) {
        recordActionFn('retry_story_url_after_consent', { attempt });
        continue;
      }

      await saveFailureArtifact(`post_consent_${resolvedState.state}`);
      return { captures: [], failureReason: `post_consent_${resolvedState.state}` };
    }

    if (attempt === 0 && ['feed', 'profile', 'wrong_story', 'unknown'].includes(resolvedState.state)) {
      recordActionFn('retry_story_url', { attempt, state: resolvedState.state });
      continue;
    }

    await saveFailureArtifact(`resolve_${resolvedState.state}`);
    return { captures: [], failureReason: `resolve_${resolvedState.state}` };
  }

  if (!resolvedState || resolvedState.state !== 'target_story') {
    await saveFailureArtifact('target_story_not_reached');
    return { captures: [], failureReason: 'target_story_not_reached' };
  }

  const captures = [];
  let previousHash = null;
  let repeatedHashCount = 0;

  for (let frameIndex = 0; frameIndex < maxFrames; frameIndex += 1) {
    if (frameIndex > 0) {
      const state = await pollState(`frame_${frameIndex}_pre`, 4000);
      recordTransitionFn(`frame_${frameIndex}_pre`, state);
      if (state.state !== 'target_story') break;
    }

    const frame = await captureFrame(frameIndex);
    if (!frame) {
      if (captures.length === 0) {
        await saveFailureArtifact(`frame_${frameIndex}_invalid`);
        return { captures: [], failureReason: `frame_${frameIndex}_invalid` };
      }
      break;
    }

    captures.push(frame.capture);
    if (frame.frameHash === previousHash) {
      repeatedHashCount += 1;
    } else {
      repeatedHashCount = 0;
      previousHash = frame.frameHash;
    }

    if (repeatedHashCount >= 2) {
      recordActionFn('stop_repeated_frame_hash', { frameIndex });
      break;
    }

    await advanceFrame(frameIndex);
  }

  return { captures, failureReason: null };
}

async function runStoryAccount(browser, options) {
  const {
    handle,
    createWorkerPage,
    diagnosticsDir,
    maxFrames = 10
  } = options;

  const diagnostics = createDiagnostics(handle, diagnosticsDir);
  const page = await createWorkerPage(browser);
  const outputDir = path.resolve(diagnosticsDir);

  try {
    const navigateToStory = async () => {
      await page.goto(buildStoryUrl(handle), {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await sleep(1000);
    };

    const pollState = async (phase, timeoutMs) => {
      return pollStorySurface(page, handle, { timeoutMs });
    };

    const clickViewStory = async () => clickViewStoryPrompt(page);

    const captureFrame = async (frameIndex) => {
      const result = await captureValidatedStoryFrame(page, handle, frameIndex, outputDir);
      if (!result.capture) {
        recordAction(diagnostics, 'capture_rejected', {
          frameIndex,
          reason: result.reason || 'invalid_frame',
          visibleHandle: result.visibleHandle || null
        });
        return null;
      }
      return result;
    };

    const advanceFrame = async () => {
      await page.keyboard.press('ArrowRight');
      await sleep(2300);
    };

    const saveFailureArtifact = async (label) => {
      setFailureReason(diagnostics, label);
      await saveFailureScreenshot(page, diagnostics, label);
    };

    await dismissCommonPopups(page);

    const outcome = await runStoryStateMachine({
      navigateToStory,
      pollState,
      clickViewStory,
      captureFrame,
      advanceFrame,
      saveFailureArtifact,
      recordAction: (action, details) => recordAction(diagnostics, action, details),
      recordTransition: (phase, state) => recordTransition(diagnostics, phase, state)
    }, {
      handle,
      maxFrames
    });

    if (outcome.failureReason) {
      setFailureReason(diagnostics, outcome.failureReason);
    }

    const diagnosticsPath = writeDiagnostics(diagnostics);
    return {
      captures: outcome.captures,
      diagnosticsPath,
      failureReason: outcome.failureReason
    };
  } finally {
    await page.close();
  }
}

module.exports = {
  buildStoryUrl,
  clickViewStoryPrompt,
  runStoryAccount,
  runStoryStateMachine
};
