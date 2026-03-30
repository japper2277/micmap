function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeHandle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split(/[/?#]/)[0]
    .replace(/[^a-z0-9._]/g, '');
}

function extractHandleFromHref(href) {
  const value = String(href || '').trim();
  if (!value) return null;

  const match = value.match(/(?:instagram\.com|^\/)(?!stories\/|accounts\/|explore\/|reels?\/|direct\/|p\/|tv\/)([a-z0-9._]+)/i);
  if (!match) return null;
  return normalizeHandle(match[1]);
}

function scoreHandleCandidate(candidate, targetHandle) {
  const target = normalizeHandle(targetHandle);
  const handle = normalizeHandle(candidate.handle);
  let score = 0;

  if (target && handle === target) score += 1000;
  if (candidate.source === 'href') score += 35;
  if (candidate.source === 'text') score += 25;
  if (candidate.top <= 140) score += 40;
  score -= Math.abs(candidate.left - 80) * 0.05;
  score -= candidate.top * 0.2;

  return score;
}

function extractVisibleStoryHandle(snapshot, targetHandle) {
  const candidates = Array.isArray(snapshot?.handleCandidates)
    ? snapshot.handleCandidates
      .map((candidate) => ({
        ...candidate,
        handle: normalizeHandle(candidate.handle || candidate.text || candidate.href || candidate.ariaLabel)
      }))
      .filter((candidate) => candidate.handle)
    : [];

  if (!candidates.length) return null;

  candidates.sort((a, b) => scoreHandleCandidate(b, targetHandle) - scoreHandleCandidate(a, targetHandle));
  return candidates[0].handle;
}

function buildFeedHints(snapshot) {
  const url = String(snapshot?.url || '').toLowerCase();
  const bodyText = String(snapshot?.bodyText || '');
  return url === 'https://www.instagram.com/' ||
    url === 'https://www.instagram.com' ||
    snapshot?.storyLinkCount > 2 ||
    (/\bsearch\b/i.test(bodyText) && snapshot?.postLinkCount > 0);
}

function buildProfileHints(snapshot, targetHandle) {
  const url = String(snapshot?.url || '').toLowerCase();
  const target = normalizeHandle(targetHandle);
  const bodyText = String(snapshot?.bodyText || '');
  const urlHandle = extractHandleFromHref(url.replace(/^https?:\/\/www\.instagram\.com/i, ''));

  return (
    !!target &&
    urlHandle === target &&
    !url.includes('/stories/') &&
    /\bfollowers\b/i.test(bodyText) &&
    /\bfollowing\b/i.test(bodyText)
  );
}

function classifySurface(snapshot, targetHandle) {
  const target = normalizeHandle(targetHandle);
  const visibleHandle = extractVisibleStoryHandle(snapshot, target);
  const url = String(snapshot?.url || '').toLowerCase();
  const bodyText = String(snapshot?.bodyText || '');
  const hasStoryControls = Boolean(snapshot?.hasPause || snapshot?.hasPlay || snapshot?.hasReplyInput);
  const hasConsentPrompt = Boolean(snapshot?.hasViewStoryPrompt);

  if (url.includes('/accounts/login') || snapshot?.hasLoginForm) {
    return { state: 'login_required', visibleHandle };
  }

  if (hasConsentPrompt) {
    if (visibleHandle && visibleHandle !== target) {
      return { state: 'wrong_story', visibleHandle };
    }
    return { state: 'consent_prompt', visibleHandle: visibleHandle || target || null };
  }

  if (hasStoryControls) {
    if (visibleHandle && visibleHandle === target) {
      return { state: 'target_story', visibleHandle };
    }
    if (visibleHandle && visibleHandle !== target) {
      return { state: 'wrong_story', visibleHandle };
    }
    return { state: 'unknown', visibleHandle, reason: 'story-controls-without-target-handle' };
  }

  if (buildProfileHints(snapshot, target)) {
    return { state: 'profile', visibleHandle };
  }

  if (buildFeedHints(snapshot) || /\bsearch\b/i.test(bodyText)) {
    return { state: 'feed', visibleHandle };
  }

  return { state: 'unknown', visibleHandle };
}

async function readStorySnapshot(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const normalizeSpace = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const normalizeHandle = (value) => String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .split(/[/?#]/)[0]
      .replace(/[^a-z0-9._]/g, '');
    const extractHandleFromHref = (href) => {
      const value = String(href || '').trim();
      if (!value) return null;
      const match = value.match(/(?:instagram\.com|^\/)(?!stories\/|accounts\/|explore\/|reels?\/|direct\/|p\/|tv\/)([a-z0-9._]+)/i);
      return match ? normalizeHandle(match[1]) : null;
    };

    const handleCandidates = [];
    const seen = new Set();
    const nodes = Array.from(document.querySelectorAll('a[href], button, span, div[role="button"], header *'));

    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.top < 0 || rect.top > Math.min(240, viewportHeight * 0.35)) continue;

      const text = normalizeSpace(node.textContent);
      const ariaLabel = normalizeSpace(node.getAttribute('aria-label'));
      const href = normalizeSpace(node.getAttribute('href'));

      const textHandle = /^[a-z0-9._]{2,30}$/i.test(text) ? normalizeHandle(text) : null;
      const ariaHandle = /^[a-z0-9._]{2,30}$/i.test(ariaLabel) ? normalizeHandle(ariaLabel) : null;
      const hrefHandle = extractHandleFromHref(href);

      const options = [
        { handle: textHandle, source: 'text' },
        { handle: ariaHandle, source: 'aria' },
        { handle: hrefHandle, source: 'href' }
      ];

      for (const option of options) {
        if (!option.handle) continue;
        const key = `${option.source}:${option.handle}:${Math.round(rect.top)}:${Math.round(rect.left)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        handleCandidates.push({
          handle: option.handle,
          text,
          ariaLabel,
          href,
          source: option.source,
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        });
      }
    }

    const buttonText = Array.from(document.querySelectorAll('button, a, div[role="button"], span[role="button"]'))
      .map((node) => normalizeSpace(node.textContent).toLowerCase())
      .filter(Boolean);

    return {
      url: window.location.href,
      title: document.title || '',
      bodyText: normalizeSpace(document.body?.innerText || ''),
      viewport: { width: viewportWidth, height: viewportHeight },
      hasLoginForm: !!document.querySelector('input[name="username"], input[name="password"]'),
      hasPause: !!document.querySelector('svg[aria-label="Pause"]'),
      hasPlay: !!document.querySelector('svg[aria-label="Play"]'),
      hasClose: !!document.querySelector('svg[aria-label="Close"]'),
      hasReplyInput: !!document.querySelector('input[placeholder*="Reply"], input[placeholder*="reply"]'),
      hasViewStoryPrompt: buttonText.includes('view story') && /view as/i.test(document.body?.innerText || ''),
      storyLinkCount: document.querySelectorAll('a[href*="/stories/"]').length,
      postLinkCount: document.querySelectorAll('a[href*="/p/"]').length,
      handleCandidates
    };
  });
}

async function pollStorySurface(page, targetHandle, options = {}) {
  const timeoutMs = options.timeoutMs || 12000;
  const intervalMs = options.intervalMs || 500;
  const deadline = Date.now() + timeoutMs;
  let last = null;

  while (Date.now() < deadline) {
    const snapshot = await readStorySnapshot(page);
    const classification = classifySurface(snapshot, targetHandle);
    last = { ...classification, snapshot };
    if (classification.state !== 'unknown') return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return last || {
    state: 'unknown',
    visibleHandle: null,
    snapshot: await readStorySnapshot(page)
  };
}

module.exports = {
  classifySurface,
  extractHandleFromHref,
  extractVisibleStoryHandle,
  normalizeHandle,
  pollStorySurface,
  readStorySnapshot,
  scoreHandleCandidate
};
