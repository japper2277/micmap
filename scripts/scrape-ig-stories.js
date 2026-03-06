#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Instagram signup ingestion (stories + recent posts).
 *
 * Outputs a structured report used by:
 * - scripts/apply-ig-signups.js (safe writes only)
 * - scripts/build-ig-review-checklist.js (review queue)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../api/.env') });

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { matchMicFromWatchlist } = require('./lib/ig-mic-matcher');
const { classifyIgCandidate } = require('./lib/ig-change-classifier');
const {
  estimateConfidence,
  extractJsonFromModelText,
  normalizeAnalysis
} = require('./lib/ig-model-parse');
const { inferContext } = require('./lib/ig-context-inference');

const IG_USERNAME = process.env.IG_USERNAME;
const IG_PASSWORD = process.env.IG_PASSWORD;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MICS_PATH = path.join(__dirname, '../api/mics.json');
const WATCHLIST_PATH = path.join(__dirname, './config/ig-watchlist.json');
const COOKIES_PATH = path.join(__dirname, '../logs/ig-cookies.json');
const DEFAULT_REPORT_PATH = path.join(__dirname, '../logs/ig-stories-report.json');
const IS_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === 'true';

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
    headful: false,
    dryRun: false,
    account: null,
    reportPath: DEFAULT_REPORT_PATH,
    remoteDebugUrl: process.env.CHROME_REMOTE_DEBUG_URL || null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--headful') out.headful = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--account' && argv[i + 1]) out.account = argv[++i];
    else if (arg === '--remote-debug-url' && argv[i + 1]) out.remoteDebugUrl = argv[++i];
    else if (arg === '--report' && argv[i + 1]) out.reportPath = path.resolve(argv[++i]);
  }

  return out;
}

function loadWatchlist() {
  if (!fs.existsSync(WATCHLIST_PATH)) {
    throw new Error(`Watchlist file missing: ${WATCHLIST_PATH}`);
  }

  const raw = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'));
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Watchlist file must be a non-empty JSON array');
  }

  return raw;
}

function loadMics() {
  return JSON.parse(fs.readFileSync(MICS_PATH, 'utf8'));
}

async function loadCookies(page) {
  if (IS_GITHUB_ACTIONS) return false;
  if (!fs.existsSync(COOKIES_PATH)) return false;

  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
  await page.setCookie(...cookies);
  console.log('Loaded saved local IG session cookies');
  return true;
}

async function saveCookies(page) {
  if (IS_GITHUB_ACTIONS) return;
  const cookies = await page.cookies();
  fs.mkdirSync(path.dirname(COOKIES_PATH), { recursive: true });
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  console.log('Saved local IG session cookies');
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function dismissDialogs(page, options = {}) {
  const { allowCloseButton = true } = options;
  let dismissed = true;
  while (dismissed) {
    dismissed = await page.evaluate((canClickCloseButton) => {
      const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
      const looksLikeStorySurface =
        window.location.href.includes('/stories/') ||
        (document.title || '').includes('Stories') ||
        (/view as/i.test(bodyText) && /view story/i.test(bodyText)) ||
        /reply to /i.test(bodyText) ||
        !!document.querySelector('svg[aria-label="Pause"]') ||
        !!document.querySelector('svg[aria-label="Play"]');

      for (const btn of document.querySelectorAll('button, div[role="button"]')) {
        const text = btn.textContent.trim().toLowerCase();
        if (/^(not now|cancel|close|dismiss|ok)$/i.test(text)) { btn.click(); return true; }
      }

      // Story pages also have a visible "Close" X for leaving the story viewer.
      // Do not treat that as a generic dialog dismiss target.
      if (looksLikeStorySurface) return false;

      if (!canClickCloseButton) return false;

      const closeBtn = document.querySelector('svg[aria-label="Close"]');
      if (closeBtn) { closeBtn.closest('button, div[role="button"]')?.click(); return true; }
      return false;
    }, allowCloseButton);
    if (dismissed) await sleep(1500);
  }
}

async function saveDebugScreenshot(page, label) {
  const debugPath = path.join(__dirname, `../logs/${label}.png`);
  fs.mkdirSync(path.dirname(debugPath), { recursive: true });
  await page.screenshot({ path: debugPath, fullPage: true });
  console.log(`Debug screenshot saved: ${debugPath}`);
}

function isStoryUrl(url, handle) {
  return url.includes(`/stories/${handle}/`) || url.includes(`/stories/${handle}?`);
}

async function getStorySurfaceState(page, handle) {
  return page.evaluate((targetHandle) => {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const title = document.title || '';
    const hasViewStoryPrompt = /view as/i.test(text) && /view story/i.test(text);
    const hasStoryControls =
      !!document.querySelector('svg[aria-label="Pause"]') ||
      !!document.querySelector('svg[aria-label="Play"]') ||
      /reply to /i.test(text);

    return {
      url: window.location.href,
      title,
      hasViewStoryPrompt,
      hasStoryControls,
      looksLikeStoryPage:
        window.location.href.includes(`/stories/${targetHandle}/`) ||
        title.includes('Stories') ||
        hasViewStoryPrompt ||
        hasStoryControls
    };
  }, handle);
}

async function waitForStorySurface(page, handle, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;

  while (Date.now() < deadline) {
    lastState = await getStorySurfaceState(page, handle);
    if (lastState.looksLikeStoryPage) return lastState;
    await sleep(500);
  }

  return lastState;
}

async function clickViewStoryPrompt(page) {
  const clicked = await page.evaluate(() => {
    const normalize = (value) => (value || '').trim().toLowerCase().replace(/\s+/g, ' ');

    for (const el of document.querySelectorAll('button, a, div[role="button"], span[role="button"]')) {
      const text = normalize(el.textContent);
      const aria = normalize(el.getAttribute('aria-label'));
      if (text === 'view story' || aria === 'view story') {
        el.click();
        return text || aria || el.tagName.toLowerCase();
      }
    }

    const xpath = "//*/text()[contains(translate(., 'VIEW STORY', 'view story'), 'view story')]/..";
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    if (result.singleNodeValue instanceof HTMLElement) {
      result.singleNodeValue.click();
      return 'xpath';
    }

    return null;
  });

  if (!clicked) return null;
  await sleep(2500);
  return clicked;
}

async function getStoryViewerClip(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const scoreCandidate = (el) => {
      if (!(el instanceof HTMLElement)) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width < 220 || rect.height < 300) return null;

      const centerX = rect.left + (rect.width / 2);
      const centerY = rect.top + (rect.height / 2);
      const dx = Math.abs(centerX - (viewportWidth / 2));
      const dy = Math.abs(centerY - (viewportHeight / 2));
      const portraitBonus = rect.height > rect.width ? 80 : 0;
      const replyBonus = el.querySelector('input[placeholder*="Reply"], input[placeholder*="reply"]') ? 120 : 0;
      const pauseBonus =
        el.querySelector('svg[aria-label="Pause"], svg[aria-label="Play"]') ? 100 : 0;
      const closeBonus = el.querySelector('svg[aria-label="Close"]') ? 120 : 0;

      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        score: closeBonus + pauseBonus + replyBonus + portraitBonus - dx - (dy * 0.5)
      };
    };

    const anchors = [
      document.querySelector('svg[aria-label="Close"]'),
      document.querySelector('svg[aria-label="Pause"]'),
      document.querySelector('svg[aria-label="Play"]'),
      document.querySelector('input[placeholder*="Reply"], input[placeholder*="reply"]')
    ].filter(Boolean);

    let best = null;
    for (const anchor of anchors) {
      let node = anchor;
      while (node && node !== document.body) {
        const candidate = scoreCandidate(node);
        if (candidate && (!best || candidate.score > best.score)) {
          best = candidate;
        }
        node = node.parentElement;
      }
    }

    // Fallback to a centered portrait crop if Instagram renders the viewer in an
    // unusual way but the story controls are still visually centered.
    if (!best) {
      const width = Math.min(Math.round(viewportWidth * 0.46), 430);
      const height = Math.min(Math.round(viewportHeight * 0.9), 860);
      best = {
        x: Math.round((viewportWidth - width) / 2),
        y: Math.round((viewportHeight - height) / 2),
        width,
        height,
        isFallback: true
      };
    }

    const padding = 12;
    const x = Math.max(0, Math.floor(best.x - padding));
    const y = Math.max(0, Math.floor(best.y - padding));
    const maxWidth = viewportWidth - x;
    const maxHeight = viewportHeight - y;

    return {
      x,
      y,
      width: Math.max(1, Math.min(Math.ceil(best.width + (padding * 2)), maxWidth)),
      height: Math.max(1, Math.min(Math.ceil(best.height + (padding * 2)), maxHeight)),
      isFallback: !!best.isFallback
    };
  });
}

async function validateStoryFrame(page, handle) {
  return page.evaluate((targetHandle) => {
    const handleLower = targetHandle.toLowerCase();
    const url = window.location.href.toLowerCase();

    // 1. If URL confirms we're on the target's story, trust it
    if (url.includes(`/stories/${handleLower}/`) || url.includes(`/stories/${handleLower}?`)) {
      return { valid: true };
    }

    // 2. Not on a story URL — check for story controls (proves we're in a viewer, not the feed)
    const hasControls =
      !!document.querySelector('svg[aria-label="Pause"]') ||
      !!document.querySelector('svg[aria-label="Play"]') ||
      !!document.querySelector('input[placeholder*="Reply"], input[placeholder*="reply"]');

    if (!hasControls) return { valid: false, reason: 'no-story-controls' };

    // 3. In a story viewer but URL doesn't confirm account — check DOM for the handle
    const candidates = document.querySelectorAll('a[href], span, header *');
    for (const el of candidates) {
      const href = (el.getAttribute('href') || '').toLowerCase();
      const text = (el.textContent || '').trim().toLowerCase();
      if (
        href.includes(`/${handleLower}/`) ||
        href.includes(`/${handleLower}?`) ||
        text === handleLower
      ) {
        return { valid: true };
      }
    }

    return { valid: false, reason: 'wrong-account' };
  }, handle);
}

async function captureStoryFrame(page, handle, frameIndex) {
  // Pause video stories so the screenshot is stable.
  await page.evaluate(() => {
    const videos = document.querySelectorAll('video');
    videos.forEach((v) => v.pause());
  });
  await sleep(500);

  console.log(`  Frame ${frameIndex} URL: ${page.url()}`);

  // Validate this frame actually belongs to the target account
  const validation = await validateStoryFrame(page, handle);
  if (!validation.valid) {
    console.log(`  Frame ${frameIndex} rejected: ${validation.reason} (expected @${handle})`);
    return null;
  }

  const screenshotPath = path.join(__dirname, `../logs/ig-story-${handle}-${frameIndex}.png`);
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  const clip = await getStoryViewerClip(page);

  // Extra safety: if getStoryViewerClip used the fallback crop, skip
  if (clip.isFallback) {
    console.log(`  Frame ${frameIndex} rejected: story viewer not found (fallback crop)`);
    return null;
  }

  await page.screenshot({ path: screenshotPath, clip });

  return {
    source: 'story',
    postUrl: null,
    screenshotPath
  };
}

async function connectToRemoteBrowser(remoteDebugUrl) {
  try {
    const resp = await fetch(remoteDebugUrl);
    const info = await resp.json();
    console.log(`Connecting to running Chrome via DevTools (${remoteDebugUrl})...`);
    return await puppeteer.connect({
      browserWSEndpoint: info.webSocketDebuggerUrl,
      defaultViewport: { width: 390, height: 844 }
    });
  } catch {
    throw new Error(
      'Could not connect to Chrome remote debugging.\n' +
      `Expected DevTools JSON at: ${remoteDebugUrl}\n` +
      'Start Chrome with remote debugging enabled and re-run this script.'
    );
  }
}

async function findReusableInstagramPage(browser) {
  const pages = await browser.pages();
  for (const page of pages) {
    const url = page.url();
    if (url.includes('instagram.com/')) {
      console.log(`Reusing existing Instagram tab: ${url}`);
      return page;
    }
  }

  return browser.newPage();
}

async function openStoryFromProfile(page, handle) {
  const profileUrl = `https://www.instagram.com/${handle}/`;
  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  await dismissDialogs(page, { allowCloseButton: false });

  const clickMethod = await page.evaluate((targetHandle) => {
    const root = document.querySelector('header') || document.body;

    const clickTarget = (element, label) => {
      const target = element.closest('a, button, div[role="button"]') || element;
      if (!(target instanceof HTMLElement)) return null;
      target.click();
      return label;
    };

    const exactLink = root.querySelector(`a[href*="/stories/${targetHandle}/"]`);
    if (exactLink) return clickTarget(exactLink, 'exact-story-link');

    const storyLink = root.querySelector('a[href*="/stories/"]');
    if (storyLink) return clickTarget(storyLink, 'generic-story-link');

    const headerNodes = root.querySelectorAll('canvas, img');
    for (const node of headerNodes) {
      const alt = (node.getAttribute('alt') || '').toLowerCase();
      if (node.tagName === 'CANVAS' || alt.includes('profile picture')) {
        const clicked = clickTarget(node, `${node.tagName.toLowerCase()}-header-target`);
        if (clicked) return clicked;
      }
    }

    return null;
  }, handle);

  if (!clickMethod) {
    await saveDebugScreenshot(page, `ig-profile-debug-${handle}`);
    console.log(`Could not find a clickable story target on @${handle}'s profile`);
    return false;
  }

  console.log(`Opened story from profile via ${clickMethod}`);
  const surface = await waitForStorySurface(page, handle, 10000);
  await dismissDialogs(page, { allowCloseButton: false });
  console.log(`Story URL after profile click: ${page.url()}`);

  if (!surface?.looksLikeStoryPage) {
    console.log('Profile click did not open story viewer — retrying direct URL...');
    await page.goto(`https://www.instagram.com/stories/${handle}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await sleep(2000);
    const retrySurface = await waitForStorySurface(page, handle, 10000);
    if (!retrySurface?.looksLikeStoryPage) {
      await saveDebugScreenshot(page, `ig-story-debug-${handle}`);
      console.log('Retry also failed to enter story viewer');
      return false;
    }
  }

  return true;
}

async function isLoggedIn(page) {
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(4000);

  // Dismiss "Save login info?" or notification prompts
  await dismissDialogs(page);

  const url = page.url();
  if (url.includes('accounts/login')) return false;

  const text = await page.evaluate(() => document.body.innerText || '');
  const loggedOut = text.includes('Log In') || text.includes('Sign Up');
  if (!loggedOut) {
    console.log('Cookie session is valid — logged in');
    return true;
  }
  return false;
}

async function login(page) {
  if (!IG_USERNAME || !IG_PASSWORD) {
    throw new Error('IG_USERNAME and IG_PASSWORD must be set');
  }

  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  await page.waitForSelector('input[name="username"]', { timeout: 10000 });
  await page.click('input[name="username"]');
  await page.type('input[name="username"]', IG_USERNAME, { delay: 45 });

  await page.click('input[name="password"]');
  await page.type('input[name="password"]', IG_PASSWORD, { delay: 45 });

  await page.keyboard.press('Enter');
  await sleep(4500);

  const currentUrl = page.url();
  if (currentUrl.includes('challenge') || currentUrl.includes('two_factor')) {
    throw new Error('Instagram requires security challenge/2FA; complete a local headful login first');
  }
  if (currentUrl.includes('login')) {
    throw new Error('Instagram login failed; verify IG_USERNAME/IG_PASSWORD');
  }

  await saveCookies(page);
}

async function scrapeStories(page, handle) {
  const storyUrl = `https://www.instagram.com/stories/${handle}/`;
  const captures = [];
  await page.goto(storyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1000);
  let surfaceAfterNav = await waitForStorySurface(page, handle, 12000);

  if (surfaceAfterNav?.hasViewStoryPrompt) {
    console.log('Story consent prompt detected after navigation; waiting briefly before click...');
    await sleep(1000);
    const clicked = await clickViewStoryPrompt(page);
    if (clicked) {
      console.log(`Clicked "View story" consent prompt (via ${clicked})`);
      // Screenshot immediately before IG can redirect away
      await sleep(500);
      const screenshotPath = path.join(__dirname, `../logs/ig-story-${handle}-${captures.length}.png`);
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      const clip = await getStoryViewerClip(page);
      await page.screenshot({ path: screenshotPath, clip });
      captures.push({ source: 'story', postUrl: null, screenshotPath });
      surfaceAfterNav = {
        ...surfaceAfterNav,
        hasViewStoryPrompt: false,
        hasStoryControls: true,
        looksLikeStoryPage: true
      };
    }
  }

  await dismissDialogs(page, { allowCloseButton: false });

  console.log(`Story URL after nav: ${page.url()}`);
  if (!surfaceAfterNav?.looksLikeStoryPage && captures.length === 0) {
    console.log('Direct story URL redirected away from target; trying profile fallback...');
    const openedFromProfile = await openStoryFromProfile(page, handle);
    if (!openedFromProfile) {
      await saveDebugScreenshot(page, `ig-story-debug-${handle}`);
      console.log('Redirected away from stories — no active stories');
      return [];
    }
  }

  const storySurface = captures.length > 0
    ? { looksLikeStoryPage: true, hasViewStoryPrompt: false }
    : await waitForStorySurface(page, handle, 8000);
  if (!storySurface?.looksLikeStoryPage && captures.length === 0) {
    await saveDebugScreenshot(page, `ig-story-debug-${handle}`);
    console.log('Could not enter story viewer after fallback — treating as no active stories');
    return [];
  }

  // Handle "View as <username>?" consent prompt
  const viewStoryClicked = captures.length === 0 && storySurface.hasViewStoryPrompt
    ? await clickViewStoryPrompt(page)
    : null;
  if (viewStoryClicked) {
    console.log(`Clicked "View story" consent prompt (via ${viewStoryClicked})`);
    // IG often redirects to the home feed after consent — re-navigate to the story
    const postConsentSurface2 = await waitForStorySurface(page, handle, 5000);
    if (!postConsentSurface2?.hasStoryControls) {
      console.log('Consent click redirected away — re-navigating to story URL...');
      await page.goto(storyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);
      await waitForStorySurface(page, handle, 10000);
    }
    const consentFrame = await captureStoryFrame(page, handle, captures.length);
    if (consentFrame) captures.push(consentFrame);
    console.log(`URL after consent click: ${page.url()}`);
  } else {
    // Check if we see the consent text at all
    const pageText = await page.evaluate(() => document.body.innerText);
    if (/view as/i.test(pageText)) {
      console.log('Warning: "View as" prompt detected but could not find clickable button');
      // Try keyboard approach
      await page.keyboard.press('Tab');
      await sleep(300);
      await page.keyboard.press('Enter');
      await sleep(4000);
      console.log('Attempted Tab+Enter to dismiss prompt');
    }
  }

  // If we got a fast first capture but IG redirected, re-navigate for remaining frames
  if (captures.length > 0 && !isStoryUrl(page.url(), handle)) {
    console.log('Re-navigating to story URL for remaining frames...');
    await page.goto(storyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    // Skip past the first frame we already captured
    if (isStoryUrl(page.url(), handle)) {
      await page.keyboard.press('ArrowRight');
      await sleep(2000);
    }
  }

  const maxFrames = 20;

  for (let frameIndex = captures.length; frameIndex < maxFrames; frameIndex += 1) {
    try {
      if (!isStoryUrl(page.url(), handle)) break;
      await sleep(1500);
      const frame = await captureStoryFrame(page, handle, frameIndex);
      if (!frame) {
        console.log(`Stopping story capture: frame ${frameIndex} failed validation`);
        break;
      }
      captures.push(frame);

      // Advance to next story frame
      await page.keyboard.press('ArrowRight');
      await sleep(2000);
    } catch (err) {
      console.log(`Story frame ${frameIndex} failed: ${err.message} — moving on`);
      break;
    }
  }

  return captures;
}

async function scrapeRecentPosts(page, handle, limit = 3) {
  await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  const postLinks = await page.evaluate((lim) => {
    const links = Array.from(document.querySelectorAll('a[href*="/p/"]'));
    return [...new Set(links.map((a) => a.href))].slice(0, lim);
  }, limit);

  const captures = [];
  for (let i = 0; i < postLinks.length; i += 1) {
    const postUrl = postLinks[i];
    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    const screenshotPath = path.join(__dirname, `../logs/ig-post-${handle}-${i}.png`);
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false });

    captures.push({
      source: 'post',
      postUrl,
      screenshotPath
    });
  }

  return captures;
}

async function analyzeWithGemini(imagePath) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

  const imageData = fs.readFileSync(imagePath).toString('base64');

  const response = await model.generateContent([
    { text: STORY_PROMPT },
    { inlineData: { mimeType: 'image/png', data: imageData } }
  ]);

  const text = response.response.text();
  return extractJsonFromModelText(text);
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

async function main() {
  const {
    headful,
    dryRun,
    account,
    reportPath,
    remoteDebugUrl
  } = parseArgs(process.argv);

  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

  const mics = loadMics();
  const watchlistRaw = loadWatchlist();
  const watchlist = account ? watchlistRaw.filter((w) => w.handle === account) : watchlistRaw;

  if (!watchlist.length) {
    throw new Error(account
      ? `Account not found in watchlist: ${account}`
      : 'Watchlist resolved to zero accounts');
  }

  const CHROME_USER_DATA = path.join(
    process.env.HOME,
    'Library/Application Support/Google/Chrome'
  );
  const useRemoteChrome = !IS_GITHUB_ACTIONS && !!remoteDebugUrl;
  const useChromeProfile = !useRemoteChrome && !IS_GITHUB_ACTIONS && headful && fs.existsSync(CHROME_USER_DATA);

  let browser;
  let connectedToRunning = false;
  if (useRemoteChrome) {
    browser = await connectToRemoteBrowser(remoteDebugUrl);
    connectedToRunning = true;
  } else if (useChromeProfile) {
    browser = await connectToRemoteBrowser('http://127.0.0.1:9222/json/version');
    connectedToRunning = true;
  } else {
    browser = await puppeteer.launch({
      headless: headful ? false : 'new',
      defaultViewport: { width: 390, height: 844 },
      ignoreHTTPSErrors: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : {})
    });
  }

  const entries = [];

  try {
    const page = connectedToRunning
      ? await findReusableInstagramPage(browser)
      : await browser.newPage();

    if (!connectedToRunning) {
      await page.setUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
      );
    }

    if (connectedToRunning) {
      const ok = await isLoggedIn(page);
      if (!ok) throw new Error('Not logged into Instagram in Chrome. Please log in via Chrome first.');
    } else if (process.env.IG_COOKIES) {
      // CI mode: load cookies from env var (base64-encoded JSON)
      let raw = process.env.IG_COOKIES;
      // Detect base64 vs raw JSON
      if (!raw.startsWith('[')) {
        raw = Buffer.from(raw, 'base64').toString('utf8');
      }
      const envCookies = JSON.parse(raw);
      await page.setCookie(...envCookies);
      console.log(`Loaded ${envCookies.length} cookies from IG_COOKIES env var`);
      const ok = await isLoggedIn(page);
      if (!ok) throw new Error('IG_COOKIES session expired. Refresh with: node scripts/ig-export-cookies.js --set-secret');
    } else {
      const cookiesLoaded = await loadCookies(page);
      if (cookiesLoaded) {
        const ok = await isLoggedIn(page);
        if (!ok) await login(page);
      } else {
        await login(page);
      }
    }

    for (const entry of watchlist) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Scanning @${entry.handle}`);

      let captures = await scrapeStories(page, entry.handle);
      if (!captures.length) {
        console.log('No active stories found, checking recent posts...');
        captures = await scrapeRecentPosts(page, entry.handle, 3);
      }

      if (!captures.length) {
        console.log('No stories or posts captured for this account');
        continue;
      }

      for (let i = 0; i < captures.length; i += 1) {
        const capture = captures[i];
        console.log(`Analyzing ${capture.source} frame ${i + 1}/${captures.length}`);

        let analysisRaw = null;
        try {
          analysisRaw = await analyzeWithGemini(capture.screenshotPath);
        } catch (error) {
          console.error(`Gemini analysis failed for ${capture.screenshotPath}: ${error.message}`);
        }

        const analysisNorm = normalizeAnalysis(analysisRaw);
        const { enrichedAnalysis: analysis, inferences } = inferContext(analysisNorm, entry, new Date());
        if (inferences.length) {
          console.log(`  Context inferred: ${inferences.map((inf) => `${inf.field}="${inf.value}"`).join(', ')}`);
        }
        const confidence = estimateConfidence(analysis);
        const matched = matchMicFromWatchlist(mics, entry, analysis);
        const classified = classifyIgCandidate({
          analysis,
          matchedMic: matched ? matched.mic : null,
          handle: entry.handle,
          source: capture.source,
          postUrl: capture.postUrl
        });

        entries.push({
          source: capture.source,
          handle: entry.handle,
          postUrl: capture.postUrl,
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
    }
  } finally {
    if (connectedToRunning) {
      browser.disconnect();
    } else {
      await browser.close();
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun,
    watchlistAccounts: watchlist.map((w) => w.handle),
    entries,
    summary: buildSummary(entries)
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\nReport written: ${reportPath}`);
  console.log(`Summary: ${JSON.stringify(report.summary)}`);
  console.log('Next: node scripts/apply-ig-signups.js --report <path> --dry-run');
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
