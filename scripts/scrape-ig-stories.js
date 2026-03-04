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
    reportPath: DEFAULT_REPORT_PATH
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--headful') out.headful = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--account' && argv[i + 1]) out.account = argv[++i];
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

async function isLoggedIn(page) {
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 4000));

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
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await page.waitForSelector('input[name="username"]', { timeout: 10000 });
  await page.click('input[name="username"]');
  await page.type('input[name="username"]', IG_USERNAME, { delay: 45 });

  await page.click('input[name="password"]');
  await page.type('input[name="password"]', IG_PASSWORD, { delay: 45 });

  await page.keyboard.press('Enter');
  await new Promise((resolve) => setTimeout(resolve, 4500));

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
  await page.goto(storyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 3000));

  if (!page.url().includes(`/stories/${handle}`)) {
    return [];
  }

  // Handle "View as <username>?" consent prompt
  const viewStoryClicked = await page.evaluate(() => {
    // Try buttons
    for (const btn of document.querySelectorAll('button')) {
      if (/view story/i.test(btn.textContent)) { btn.click(); return 'button'; }
    }
    // Try links/divs that look like buttons
    for (const el of document.querySelectorAll('a, div[role="button"], span[role="button"]')) {
      if (/view story/i.test(el.textContent)) { el.click(); return 'element'; }
    }
    // Try any clickable element with that text
    const xpath = "//*/text()[contains(translate(., 'VIEW STORY', 'view story'), 'view story')]/..";
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    if (result.singleNodeValue) { result.singleNodeValue.click(); return 'xpath'; }
    return false;
  });
  if (viewStoryClicked) {
    console.log(`Clicked "View story" consent prompt (via ${viewStoryClicked})`);
    await new Promise((resolve) => setTimeout(resolve, 4000));
  } else {
    // Check if we see the consent text at all
    const pageText = await page.evaluate(() => document.body.innerText);
    if (/view as/i.test(pageText)) {
      console.log('Warning: "View as" prompt detected but could not find clickable button');
      // Try keyboard approach
      await page.keyboard.press('Tab');
      await new Promise((resolve) => setTimeout(resolve, 300));
      await page.keyboard.press('Enter');
      await new Promise((resolve) => setTimeout(resolve, 4000));
      console.log('Attempted Tab+Enter to dismiss prompt');
    }
  }

  const captures = [];
  const maxFrames = 20;

  for (let frameIndex = 0; frameIndex < maxFrames; frameIndex += 1) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Pause any playing video so we get a clean screenshot
      await page.evaluate(() => {
        const videos = document.querySelectorAll('video');
        videos.forEach((v) => v.pause());
      });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const screenshotPath = path.join(__dirname, `../logs/ig-story-${handle}-${frameIndex}.png`);
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: false });

      captures.push({
        source: 'story',
        postUrl: null,
        screenshotPath
      });

      // Advance to next story frame
      await page.keyboard.press('ArrowRight');
      await new Promise((resolve) => setTimeout(resolve, 2300));
      if (!page.url().includes(`/stories/${handle}`)) break;
    } catch (err) {
      console.log(`Story frame ${frameIndex} failed: ${err.message} — moving on`);
      break;
    }
  }

  return captures;
}

async function scrapeRecentPosts(page, handle, limit = 3) {
  await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const postLinks = await page.evaluate((lim) => {
    const links = Array.from(document.querySelectorAll('a[href*="/p/"]'));
    return [...new Set(links.map((a) => a.href))].slice(0, lim);
  }, limit);

  const captures = [];
  for (let i = 0; i < postLinks.length; i += 1) {
    const postUrl = postLinks[i];
    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 2000));

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
  const { headful, dryRun, account, reportPath } = parseArgs(process.argv);

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
  const useChromeProfile = !IS_GITHUB_ACTIONS && headful && fs.existsSync(CHROME_USER_DATA);

  let browser;
  let connectedToRunning = false;
  if (useChromeProfile) {
    // Try connecting to a running Chrome with remote debugging
    const REMOTE_PORT = 9222;
    try {
      const resp = await fetch(`http://127.0.0.1:${REMOTE_PORT}/json/version`);
      const info = await resp.json();
      console.log('Connecting to running Chrome via DevTools...');
      browser = await puppeteer.connect({
        browserWSEndpoint: info.webSocketDebuggerUrl,
        defaultViewport: { width: 390, height: 844 }
      });
      connectedToRunning = true;
    } catch {
      console.log(
        'Could not connect to Chrome. Start Chrome with remote debugging:\n' +
        '  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222\n' +
        'Then re-run this script.'
      );
      process.exit(1);
    }
  } else {
    browser = await puppeteer.launch({
      headless: headful ? false : 'new',
      defaultViewport: { width: 390, height: 844 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : {})
    });
  }

  const entries = [];

  try {
    const page = await browser.newPage();
    if (!useChromeProfile) {
      await page.setUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
      );
    }

    if (useChromeProfile) {
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
