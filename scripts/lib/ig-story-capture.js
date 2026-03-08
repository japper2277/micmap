const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { normalizeHandle, readStorySnapshot } = require('./ig-story-state');

function computeStoryViewerClip(snapshot, targetHandle) {
  const target = normalizeHandle(targetHandle);
  const viewportWidth = snapshot?.viewport?.width || 0;
  const viewportHeight = snapshot?.viewport?.height || 0;
  const candidates = Array.isArray(snapshot?.candidates) ? snapshot.candidates : [];

  const scored = candidates
    .filter((candidate) => (
      candidate.hasTargetHandle &&
      candidate.hasControls &&
      candidate.hasMedia &&
      candidate.width >= 220 &&
      candidate.height >= 320
    ))
    .map((candidate) => {
      const centerX = candidate.x + (candidate.width / 2);
      const centerY = candidate.y + (candidate.height / 2);
      const dx = Math.abs(centerX - (viewportWidth / 2));
      const dy = Math.abs(centerY - (viewportHeight / 2));
      const portraitBonus = candidate.height > candidate.width ? 90 : 0;
      const ratio = candidate.height / candidate.width;
      const ratioPenalty = Math.abs(ratio - 1.7) * 80;
      const targetBonus = normalizeHandle(candidate.visibleHandle) === target ? 150 : 0;
      const controlBonus = candidate.hasReplyInput ? 60 : 0;

      return {
        ...candidate,
        score: portraitBonus + targetBonus + controlBonus - dx - (dy * 0.5) - ratioPenalty
      };
    })
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;

  const best = scored[0];
  const padding = 12;
  const x = Math.max(0, Math.floor(best.x - padding));
  const y = Math.max(0, Math.floor(best.y - padding));
  const maxWidth = viewportWidth - x;
  const maxHeight = viewportHeight - y;

  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.ceil(best.width + (padding * 2)), maxWidth)),
    height: Math.max(1, Math.min(Math.ceil(best.height + (padding * 2)), maxHeight))
  };
}

async function collectViewerSnapshot(page, targetHandle) {
  return page.evaluate((target) => {
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

    const targetHandle = normalizeHandle(target);
    const candidateMap = new Map();

    const markAncestors = (seed, flags) => {
      let node = seed;
      let depth = 0;
      while (node && node !== document.body && depth < 7) {
        if (node instanceof HTMLElement) {
          const rect = node.getBoundingClientRect();
          if (rect.width >= 220 && rect.height >= 320) {
            const key = [
              Math.round(rect.left),
              Math.round(rect.top),
              Math.round(rect.width),
              Math.round(rect.height)
            ].join(':');

            const existing = candidateMap.get(key) || {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
              hasTargetHandle: false,
              hasControls: false,
              hasReplyInput: false,
              hasMedia: false,
              visibleHandle: null
            };

            existing.hasTargetHandle = existing.hasTargetHandle || !!flags.hasTargetHandle;
            existing.hasControls = existing.hasControls || !!flags.hasControls;
            existing.hasReplyInput = existing.hasReplyInput || !!flags.hasReplyInput;
            existing.hasMedia = existing.hasMedia || !!node.querySelector('img, video, canvas');
            existing.visibleHandle = existing.visibleHandle || flags.visibleHandle || null;

            candidateMap.set(key, existing);
          }
        }

        node = node.parentElement;
        depth += 1;
      }
    };

    const topNodes = Array.from(document.querySelectorAll('a[href], button, span, div[role="button"], header *'));
    for (const node of topNodes) {
      if (!(node instanceof HTMLElement)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.top < 0 || rect.top > Math.min(240, viewportHeight * 0.35)) continue;

      const text = normalizeSpace(node.textContent);
      const href = normalizeSpace(node.getAttribute('href'));
      const ariaLabel = normalizeSpace(node.getAttribute('aria-label'));
      const handle = normalizeHandle(text) || extractHandleFromHref(href) || normalizeHandle(ariaLabel);
      if (!handle || handle !== targetHandle) continue;

      markAncestors(node, {
        hasTargetHandle: true,
        visibleHandle: handle
      });
    }

    const controlNodes = [
      ...document.querySelectorAll('svg[aria-label="Close"], svg[aria-label="Pause"], svg[aria-label="Play"]'),
      ...document.querySelectorAll('input[placeholder*="Reply"], input[placeholder*="reply"]')
    ];

    for (const node of controlNodes) {
      const isReply = node instanceof HTMLElement && node.matches('input[placeholder*="Reply"], input[placeholder*="reply"]');
      markAncestors(node instanceof HTMLElement ? node : node.parentElement, {
        hasControls: true,
        hasReplyInput: isReply
      });
    }

    return {
      viewport: { width: viewportWidth, height: viewportHeight },
      candidates: Array.from(candidateMap.values())
    };
  }, targetHandle);
}

async function pauseStoryMedia(page) {
  await page.evaluate(() => {
    const videos = document.querySelectorAll('video');
    videos.forEach((video) => video.pause());
  });
}

async function captureValidatedStoryFrame(page, handle, frameIndex, outputDir) {
  await pauseStoryMedia(page);
  const surface = await readStorySnapshot(page);
  const visibleHandle = normalizeHandle(surface && surface.handleCandidates && surface.handleCandidates[0]?.handle);
  const viewerSnapshot = await collectViewerSnapshot(page, handle);
  const clip = computeStoryViewerClip(viewerSnapshot, handle);

  if (!clip) {
    return { capture: null, reason: 'viewer-not-found', visibleHandle };
  }

  const screenshotPath = path.join(outputDir, `ig-story-${handle}-${frameIndex}.png`);
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  const buffer = await page.screenshot({ clip });
  fs.writeFileSync(screenshotPath, buffer);

  return {
    capture: {
      source: 'story',
      postUrl: null,
      screenshotPath
    },
    frameHash: crypto.createHash('sha1').update(buffer).digest('hex'),
    visibleHandle
  };
}

module.exports = {
  captureValidatedStoryFrame,
  collectViewerSnapshot,
  computeStoryViewerClip,
  pauseStoryMedia
};
