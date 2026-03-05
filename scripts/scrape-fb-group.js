#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Facebook Group scraper for NYC Comedy Scene.
 *
 * Extracts recent posts from the group feed and POSTs them to the
 * /admin/fb-group-post webhook endpoint for server-side processing
 * (Gemini analysis, mic matching, classification).
 *
 * Usage:
 *   node scripts/scrape-fb-group.js                           # headless, local cookies
 *   node scripts/scrape-fb-group.js --headful --dry-run       # local Chrome, no POST
 *   node scripts/scrape-fb-group.js --limit 10 --api http://localhost:3001
 *   node scripts/scrape-fb-group.js --max-recall              # high-recall 4-6 min mode
 *   node scripts/scrape-fb-group.js --group-url <url>         # override group URL
 */

require('dotenv').config({ path: require('path').join(__dirname, '../api/.env') });

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const GROUP_URL = 'https://www.facebook.com/groups/nyccomedyscene';
const GROUP_URL_NUMERIC = 'https://www.facebook.com/groups/198219734918102';
const COOKIES_PATH = path.join(__dirname, '../logs/fb-cookies.json');
const TEMP_PROFILE_DIR = path.join(__dirname, '../logs/fb-headless-profile');
const IS_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
const DEFAULT_API_BASE = process.env.MICMAP_API_BASE || 'https://micmap-production.up.railway.app';
const CHROME_PATH_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
];
const DEVTOOLS_PROTOCOL_TIMEOUT_MS = 420000;
const CAPTURE_PROFILES = {
  balanced: {
    maxDurationMs: 240000,
    minDurationMs: 0,
    maxScrollRounds: 30,
    stepsPerRound: 8,
    deltaY: 420,
    settleMs: 320,
    longSettleEvery: 6,
    longSettleMs: 1200,
    backtrackEverySteps: 0,
    backtrackDeltaY: 0,
    stationaryPassDelaysMs: [0],
    emptyRoundsToStop: 3
  },
  'max-recall': {
    maxDurationMs: 330000,
    minDurationMs: 180000,
    maxScrollRounds: 60,
    stepsPerRound: 10,
    deltaY: 350,
    settleMs: 300,
    longSettleEvery: 4,
    longSettleMs: 1500,
    backtrackEverySteps: 5,
    backtrackDeltaY: -220,
    stationaryPassDelaysMs: [0, 700, 1500],
    emptyRoundsToStop: 4
  }
};

function parseArgs(argv) {
  const out = {
    headful: false,
    dryRun: false,
    debug: false,
    help: false,
    captureMode: 'max-recall',
    limit: 20,
    apiBase: DEFAULT_API_BASE,
    groupUrl: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--headful') out.headful = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--debug') out.debug = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--max-recall') out.captureMode = 'max-recall';
    else if (arg === '--balanced') out.captureMode = 'balanced';
    else if (arg === '--capture-mode' && argv[i + 1]) out.captureMode = String(argv[++i]).toLowerCase();
    else if (arg === '--numeric') out.groupUrl = GROUP_URL_NUMERIC;
    else if (arg === '--limit' && argv[i + 1]) out.limit = parseInt(argv[++i], 10);
    else if (arg === '--api' && argv[i + 1]) out.apiBase = argv[++i];
    else if (arg === '--group-url' && argv[i + 1]) out.groupUrl = argv[++i];
  }

  if (!Number.isFinite(out.limit) || out.limit <= 0) out.limit = 20;
  if (!CAPTURE_PROFILES[out.captureMode]) out.captureMode = 'max-recall';
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientPageError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('detached frame') ||
    msg.includes('frame was detached') ||
    msg.includes('execution context was destroyed') ||
    msg.includes('cannot find context with specified id') ||
    msg.includes('target closed') ||
    msg.includes('net::err_aborted')
  );
}

async function retryTransient(label, fn, attempts = 3) {
  let lastErr = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientPageError(err) || attempt >= attempts) {
        throw err;
      }
      console.warn(`[retry] ${label} failed (${err.message}) — retrying (${attempt}/${attempts})`);
      await sleep(700 * attempt);
    }
  }
  throw lastErr;
}

function pickChromeExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  for (const candidate of CHROME_PATH_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function buildLaunchConfig(headful) {
  const launchConfig = {
    headless: headful ? false : 'new',
    defaultViewport: { width: 1280, height: 900 },
    timeout: 120000,
    protocolTimeout: DEVTOOLS_PROTOCOL_TIMEOUT_MS,
    userDataDir: TEMP_PROFILE_DIR,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-breakpad',
      '--disable-crash-reporter',
      '--disable-features=Translate,MediaRouter'
    ]
  };

  const executablePath = pickChromeExecutable();
  if (executablePath) {
    launchConfig.executablePath = executablePath;
  }
  return launchConfig;
}

function printHelp() {
  console.log(
    'Usage:\n' +
    '  node scripts/scrape-fb-group.js [options]\n\n' +
    'Options:\n' +
    '  --headful               Use visible browser (tries remote-debugging Chrome first)\n' +
    '  --dry-run               Extract only, do not POST to API\n' +
    '  --debug                 Print detailed extraction diagnostics\n' +
    '  --capture-mode <mode>   Capture mode: balanced|max-recall (default: max-recall)\n' +
    '  --max-recall            Shortcut for --capture-mode max-recall\n' +
    '  --balanced              Shortcut for --capture-mode balanced\n' +
    '  --limit <n>             Max posts to process (default: 20)\n' +
    '  --api <url>             API base URL (default from MICMAP_API_BASE)\n' +
    '  --group-url <url>       Use an explicit Facebook group URL\n' +
    '  --numeric               Shortcut for numeric group URL\n' +
    '  --help, -h              Show this help'
  );
}

async function launchBrowser(headful) {
  const launchConfig = buildLaunchConfig(headful);
  try {
    return await puppeteer.launch(launchConfig);
  } catch (err) {
    const execPath = launchConfig.executablePath || '(Puppeteer default)';
    throw new Error(
      `${err.message}\n` +
      `Launch config: headful=${headful} executablePath=${execPath} userDataDir=${launchConfig.userDataDir}\n` +
      'Try one of:\n' +
      '  1) export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"\n' +
      '  2) node scripts/scrape-fb-group.js --headful (with Chrome remote debugging enabled)'
    );
  }
}

async function loadCookies(page) {
  if (IS_GITHUB_ACTIONS) {
    const raw = process.env.FB_COOKIES;
    if (!raw) throw new Error('FB_COOKIES env var not set');
    const json = raw.startsWith('[') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const cookies = JSON.parse(json);
    await page.setCookie(...cookies);
    console.log(`Loaded ${cookies.length} cookies from FB_COOKIES env var`);
    return;
  }

  if (fs.existsSync(COOKIES_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
    await page.setCookie(...cookies);
    console.log('Loaded saved local FB session cookies');
    return;
  }

  throw new Error(
    'No Facebook cookies found. Export them first:\n' +
    '  1. Launch Chrome: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir="logs/fb-chrome-profile"\n' +
    '  2. Log into Facebook\n' +
    '  3. Run: node scripts/fb-export-cookies.js'
  );
}

async function verifyLogin(page) {
  await retryTransient(
    'verifyLogin.goto',
    () => page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 }),
    4
  );
  await sleep(3000);

  const url = page.url();
  if (url.includes('/login') || url.includes('checkpoint')) return false;

  const hasLoginForm = await retryTransient(
    'verifyLogin.evaluate',
    () => page.evaluate(() => {
      return !!document.querySelector('input[name="email"]') && !!document.querySelector('input[name="pass"]');
    }),
    4
  );

  return !hasLoginForm;
}

async function dismissDialogs(page) {
  const dismissed = await retryTransient(
    'dismissDialogs.evaluate',
    () => page.evaluate(() => {
      const results = [];

      for (const btn of document.querySelectorAll('button, [role="button"]')) {
        const text = (btn.textContent || '').trim().toLowerCase();
        if (text === 'allow all cookies' || text === 'accept all' || text === 'allow essential and optional cookies') {
          btn.click();
          results.push(`cookie: "${text}"`);
          break;
        }
      }

      for (const btn of document.querySelectorAll('button, [role="button"], a')) {
        const text = (btn.textContent || '').trim().toLowerCase();
        if (text === 'not now' || text === 'decline' || text === 'close') {
          btn.click();
          results.push(`dialog: "${text}"`);
          break;
        }
      }

      return results;
    }),
    3
  ).catch(() => []);

  if (dismissed.length) {
    console.log(`Dismissed dialogs: ${dismissed.join(', ')}`);
    await sleep(1500);
  }
}

async function inspectPageState(page) {
  return retryTransient(
    'inspectPageState.evaluate',
    () => page.evaluate(() => {
      const text = (document.body?.innerText || '').toLowerCase();
      return {
        url: window.location.href,
        hasFeed: !!document.querySelector('[role="feed"]'),
        articleCount: document.querySelectorAll('[role="article"]').length,
        hasLoginForm: !!document.querySelector('input[name="email"]') && !!document.querySelector('input[name="pass"]'),
        unavailableHint:
          text.includes('this content isn\'t available right now') ||
          text.includes('this content is not available right now') ||
          text.includes('content isn\'t available') ||
          text.includes('content is unavailable') ||
          text.includes('go to feed')
      };
    }),
    4
  );
}

async function waitForFeed(page, timeoutMs = 25000) {
  try {
    await retryTransient(
      'waitForFeed.waitForFunction',
      () => page.waitForFunction(
        () => !!document.querySelector('[role="feed"]') || document.querySelectorAll('[role="article"]').length > 0,
        { timeout: timeoutMs }
      ),
      3
    );
  } catch {
    // We'll inspect page state and decide what to do next.
  }
  return inspectPageState(page);
}

async function createLoggedInPage(browser) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const page = await browser.newPage();
    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      await loadCookies(page);
      const loggedIn = await verifyLogin(page);
      if (!loggedIn) {
        if (IS_GITHUB_ACTIONS) {
          throw new Error('FB_COOKIES session expired. Refresh with: node scripts/fb-export-cookies.js --set-secret');
        }
        throw new Error('Not logged into Facebook. Export cookies first: node scripts/fb-export-cookies.js');
      }
      return page;
    } catch (err) {
      lastErr = err;
      await page.close().catch(() => {});
      if (isTransientPageError(err) && attempt < 3) {
        console.warn(`[retry] createLoggedInPage failed (${err.message}) — retrying (${attempt}/3)`);
        await sleep(1000 * attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('Failed to create logged-in Facebook page');
}

async function navigateToGroup(page, preferredUrl = null) {
  const urlOrder = preferredUrl
    ? [preferredUrl]
    : [GROUP_URL_NUMERIC, GROUP_URL];

  for (const url of urlOrder) {
    console.log(`Navigating to ${url}`);
    await retryTransient(
      'navigateToGroup.goto',
      () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }),
      4
    );
    await sleep(3500);
    await dismissDialogs(page);
    const state = await waitForFeed(page);

    if (state.hasLoginForm) {
      throw new Error('Facebook session is not logged in. Re-export cookies: node scripts/fb-export-cookies.js');
    }
    if (state.hasFeed || state.articleCount > 0) {
      return { url, state };
    }

    if (state.unavailableHint) {
      console.warn(`Group page unavailable at ${url}; trying fallback URL if available...`);
    }
  }

  const finalState = await inspectPageState(page);
  throw new Error(
    'Could not load Facebook group feed. ' +
    `url=${finalState.url} feed=${finalState.hasFeed} articles=${finalState.articleCount}. ` +
    'Make sure your account is logged in and is a member of the group.'
  );
}

async function extractPosts(page, limit, debug = false) {
  const result = await page.evaluate((lim, includeDebug) => {
    const authorSelectors = [
      'h2 a[role="link"]',
      'h3 a[role="link"]',
      'a[role="link"][href*="/user/"]',
      'a[role="link"][href*="/profile.php"]',
      'a[href*="/groups/"][href*="/user/"]'
    ];

    const nodes = [];
    const seenNodes = new Set();
    const hasVisibleContent = (node) => {
      if (!node) return false;
      const text = (node.innerText || '').trim();
      if (text.length > 0) return true;
      return Boolean(
        node.querySelector(
          'img[src*="scontent"], a[href], div[role="button"], button, [role="link"]'
        )
      );
    };
    const pushNode = (node) => {
      if (!node || seenNodes.has(node)) return;
      seenNodes.add(node);
      nodes.push(node);
    };

    const feed = document.querySelector('[role="feed"]');
    const feedChildren = feed ? Array.from(feed.children) : [];
    const findFeedChild = (el) => {
      for (const child of feedChildren) {
        if (child.contains(el)) return child;
      }
      return null;
    };

    for (const article of document.querySelectorAll('[role="article"]')) {
      const t = (article.innerText || '').trim();
      if (t.length > 0 || article.querySelector('img[src*="scontent"]')) {
        pushNode(article);
      }
    }

    if (feed) {
      for (const anchor of feed.querySelectorAll(authorSelectors.join(', '))) {
        pushNode(findFeedChild(anchor));
      }
      for (const signalEl of feed.querySelectorAll(
        'img[src*="scontent"], a[href*="/posts/"], a[href*="story_fbid="], a[href*="/permalink/"], a[href*="/photo/"], a[href*="/photos/"], a[href*="/stories/"], div[role="button"], button'
      )) {
        pushNode(findFeedChild(signalEl));
      }
      for (const child of feedChildren) {
        if (hasVisibleContent(child)) pushNode(child);
      }
    }

    if (!nodes.length) {
      return { posts: [], debugEntries: [], skipStats: {}, capturedCount: 0, candidateCount: 0 };
    }

    const posts = [];
    const debugEntries = includeDebug ? [] : [];
    const skipStats = {};
    let capturedCount = 0;
    const seenHashes = new Set();
    let hitLimit = false;
    const timeMarkerRegex = /^(just now|yesterday|\d+\s?(m|min|mins|h|hr|hrs|d|w)|\d+\s?hours?)$/i;

    const isUnavailablePlaceholder = (value) => {
      const text = (value || '').toLowerCase();
      return (
        text.includes('this content isn\'t available right now') ||
        text.includes('this content is not available right now') ||
        text.includes('content isn\'t available') ||
        text.includes('content is unavailable') ||
        text.includes('owner only shared it with a small group')
      );
    };

    const isNonPostUiText = (value) => {
      const text = (value || '').toLowerCase();
      if (!text) return true;
      if (isUnavailablePlaceholder(text)) return true;

      if (
        text.startsWith('sort group feed by') ||
        text.startsWith('new york comedy scene private') ||
        text.startsWith('groups new york city comedy scene public')
      ) {
        return true;
      }

      const signals = [
        /private group/,
        /public group/,
        /\bmember since\b/,
        /\bfacebook group for\b/,
        /\bpost your open mic/,
        /\bsort group feed/,
        /\bwrite something\b/,
        /\bcreate job\b/,
        /\bfeeling\/activity\b/,
        /\bcheck in\b/,
        /\bnew posts\b/
      ];
      let hits = 0;
      for (const signal of signals) {
        if (signal.test(text)) hits += 1;
      }
      if (hits >= 2) return true;

      if ((/private\s*·/.test(text) || /public\s*·/.test(text)) && /\bmembers\b/.test(text)) {
        return true;
      }

      return false;
    };

    const bumpSkip = (reason) => {
      skipStats[reason] = (skipStats[reason] || 0) + 1;
    };

    const hashFromText = (text) => {
      let hash = 0;
      for (let i = 0; i < text.length && i < 200; i += 1) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
      }
      return Math.abs(hash);
    };

    const normalizeExternalUrl = (rawHref, absoluteHref) => {
      let url = null;
      try {
        const abs = absoluteHref || rawHref;
        if (!abs) return null;
        const parsed = new URL(abs, window.location.origin);
        if (parsed.hostname.includes('l.facebook.com') || parsed.pathname === '/l.php') {
          const wrapped = parsed.searchParams.get('u');
          if (wrapped) url = decodeURIComponent(wrapped);
        }
      } catch {
        // Ignore parse issues and continue below.
      }

      if (!url && absoluteHref && /^https?:\/\//i.test(absoluteHref)) {
        url = absoluteHref;
      }
      if (!url) return null;

      try {
        const parsedUrl = new URL(url);
        parsedUrl.searchParams.delete('fbclid');
        if (parsedUrl.hostname.includes('facebook.com') || parsedUrl.hostname.includes('fb.com')) {
          return null;
        }
        return parsedUrl.toString();
      } catch {
        return null;
      }
    };

    const normalizeSeedUrl = (raw) => {
      if (!raw) return null;
      try {
        const parsedUrl = new URL(raw, window.location.href);
        parsedUrl.searchParams.delete('fbclid');
        parsedUrl.hash = '';
        return parsedUrl.toString();
      } catch {
        return null;
      }
    };

    const normalizeImageSeedUrl = (raw) => {
      const normalized = normalizeSeedUrl(raw);
      if (!normalized) return null;
      try {
        const parsed = new URL(normalized);
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString();
      } catch {
        return null;
      }
    };

    const scoreMicRelevance = (postText, links) => {
      const text = (postText || '').toLowerCase();
      const joinedLinks = Array.isArray(links) ? links.join(' ').toLowerCase() : '';
      const signals = [];
      let score = 0;

      const addSignal = (matched, label, weight) => {
        if (!matched) return;
        score += weight;
        signals.push(label);
      };

      addSignal(/\bopen mic\b/.test(text), 'keyword:open_mic', 0.3);
      addSignal(/\bmic\b/.test(text), 'keyword:mic', 0.12);
      addSignal(/\blist\b/.test(text), 'keyword:list', 0.08);
      addSignal(/\bshow up go up\b/.test(text), 'keyword:show_up_go_up', 0.16);
      addSignal(/\bspots?\b/.test(text), 'keyword:spots', 0.09);
      addSignal(/\bminutes?\b/.test(text), 'keyword:minutes', 0.08);
      addSignal(/\bsign[\s-]?up\b/.test(text), 'keyword:signup', 0.12);
      addSignal(/\bhosted by\b/.test(text), 'keyword:hosted_by', 0.08);

      const hasPlatformLink = /(punchup|slotted|eventbrite|humanitix|lu\.ma|dice\.fm)/i.test(joinedLinks);
      addSignal(hasPlatformLink, 'platform:known_signup', 0.22);

      const hasWeekday = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|wed|thu|thurs|fri|sat|sun)\b/i.test(text);
      const hasTime = /\b\d{1,2}(?::\d{2})?\s?(am|pm)\b/i.test(text);
      addSignal(hasWeekday && hasTime, 'schedule:weekday_time', 0.2);

      if (/\b(shared with public|follow|does good photos)\b/i.test(text)) {
        score -= 0.18;
        signals.push('penalty:non_event_share');
      }

      if (/\b(meme|shitpost)\b/i.test(text)) {
        score -= 0.2;
        signals.push('penalty:meme');
      }

      const bounded = Math.max(0, Math.min(1, score));
      return { micConfidence: Math.round(bounded * 100) / 100, micSignals: signals };
    };

    const findAuthor = (node) => {
      for (const selector of authorSelectors) {
        for (const a of node.querySelectorAll(selector)) {
          const t = (a.textContent || '').replace(/\s+/g, ' ').trim();
          if (
            t.length > 1 &&
            t.length < 80 &&
            t !== 'Facebook' &&
            !/comment|reply|share|like|more|see all/i.test(t)
          ) {
            return t;
          }
        }
      }
      return null;
    };

    for (let idx = 0; idx < nodes.length; idx += 1) {
      const child = nodes[idx];

      const authorGuess = findAuthor(child);
      const hasAuthorMarker = Boolean(authorGuess);
      const hasEngagementMarker = Array.from(child.querySelectorAll('div[role="button"],button'))
        .some((b) => /like|comment|share/i.test((b.textContent || '').toLowerCase()));

      let permalinkCanonical = null;
      let timeAnchorCandidate = null;
      let firstTimeMarkerText = null;
      for (const a of child.querySelectorAll('a[href]')) {
        const rawHref = a.getAttribute('href') || '';
        const href = normalizeSeedUrl(rawHref || a.href || '');
        const anchorText = (a.textContent || '').replace(/\s+/g, ' ').trim();

        if (!permalinkCanonical && href) {
          const pm = href.match(/\/permalink\/(\d+)/) ||
                     href.match(/\/posts\/(\d+)/) ||
                     href.match(/\/groups\/[^/]+\/posts\/(\d+)/) ||
                     href.match(/story_fbid=(\d+)/);
          if (pm) permalinkCanonical = href;
        }

        if (!timeAnchorCandidate && href && timeMarkerRegex.test(anchorText)) {
          timeAnchorCandidate = href;
        }
        if (!firstTimeMarkerText && timeMarkerRegex.test(anchorText)) {
          firstTimeMarkerText = anchorText;
        }
      }
      if (!firstTimeMarkerText) {
        for (const n of child.querySelectorAll('span,abbr')) {
          const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
          if (timeMarkerRegex.test(t)) {
            firstTimeMarkerText = t;
            break;
          }
        }
      }
      const hasTimeMarker = Boolean(firstTimeMarkerText);

      let imageUrl = null;
      for (const img of child.querySelectorAll('img[src*="scontent"]')) {
        const w = parseInt(img.getAttribute('width'), 10) || img.naturalWidth || 0;
        const h = parseInt(img.getAttribute('height'), 10) || img.naturalHeight || 0;
        if (w > 100 && h > 100) {
          imageUrl = img.src;
          break;
        }
      }

      const isPostLikeNode = hasAuthorMarker && (Boolean(permalinkCanonical) || Boolean(imageUrl) || hasTimeMarker || hasEngagementMarker);

      // Extract text from dir="auto" elements first, then fallback to innerText lines.
      const textParts = [];
      const seenText = new Set();
      const textEls = child.querySelectorAll('div[dir="auto"], span[dir="auto"], p');
      textEls.forEach((d) => {
        const t = (d.textContent || '').replace(/\s+/g, ' ').trim();
        if (t.length > 5 && !seenText.has(t) && t !== 'Facebook') {
          seenText.add(t);
          textParts.push(t);
        }
      });

      if (textParts.length === 0) {
        const fallbackLines = (child.innerText || '')
          .split('\n')
          .map((line) => line.replace(/\s+/g, ' ').trim())
          .filter((line) => line.length > 5)
          .slice(0, 20);
        fallbackLines.forEach((line) => {
          if (!seenText.has(line) && line !== 'Facebook') {
            seenText.add(line);
            textParts.push(line);
          }
        });
      }

      const text = textParts.join('\n');
      let effectiveText = text;
      if (effectiveText.length < 20 && isPostLikeNode && imageUrl) {
        effectiveText = '[image-only post]';
      }

      const entry = {
        childIndex: idx,
        textNodes: textEls.length,
        textLength: effectiveText.length,
        preview: effectiveText.slice(0, 80).replace(/\n/g, ' '),
        postId: `fb_node_${idx}`,
        authorGuess,
        markers: {
          author: hasAuthorMarker,
          time: hasTimeMarker,
          actions: hasEngagementMarker,
          permalink: Boolean(permalinkCanonical),
          image: Boolean(imageUrl)
        },
        skipReason: null
      };

      if (hitLimit) {
        entry.skipReason = 'limit_reached';
        bumpSkip(entry.skipReason);
        if (includeDebug) debugEntries.push(entry);
        continue;
      }

      if (!isPostLikeNode) {
        entry.skipReason = 'not_post_like_node';
        bumpSkip(entry.skipReason);
        if (includeDebug) debugEntries.push(entry);
        continue;
      }

      if (effectiveText.length < 20) {
        entry.skipReason = `text_too_short (${effectiveText.length} < 20)`;
        bumpSkip(entry.skipReason);
        if (includeDebug) debugEntries.push(entry);
        continue;
      }

      if (isNonPostUiText(effectiveText)) {
        entry.skipReason = isUnavailablePlaceholder(effectiveText) ? 'unavailable_placeholder' : 'non_post_ui_block';
        bumpSkip(entry.skipReason);
        if (includeDebug) debugEntries.push(entry);
        continue;
      }

      const externalLinks = [];
      const seenLinks = new Set();
      for (const a of child.querySelectorAll('a[href]')) {
        const rawHref = a.getAttribute('href') || '';
        const href = a.href || rawHref;
        let url = normalizeExternalUrl(rawHref, href);

        if (!url) {
          const linkText = (a.textContent || '').trim();
          if (/^https?:\/\/[^\s]+/.test(linkText) && !linkText.includes('facebook.com')) {
            url = linkText.replace(/[.)]+$/, '');
          }
        }

        if (!url) {
          const label = a.getAttribute('aria-label') || '';
          const platformMatch = label.match(/\b(tixol\w*|punchup|slotted|eventbrite|dice\.fm|shotgun\w*|humanitix|lu\.ma)\b/i);
          if (platformMatch) {
            url = `[link-preview] ${label}`;
          }
        }

        if (url && !seenLinks.has(url)) {
          seenLinks.add(url);
          externalLinks.push(url);
        }
      }

      const urlRegex = /https?:\/\/[^\s),]+/g;
      let match;
      while ((match = urlRegex.exec(text)) !== null) {
        const url = match[0].replace(/[.)]+$/, '');
        if (!seenLinks.has(url) && !url.includes('facebook.com')) {
          seenLinks.add(url);
          externalLinks.push(url);
        }
      }

      const primaryExternalLink = externalLinks.find((link) => /^https?:\/\//i.test(link)) || null;
      const canonicalSeed = normalizeSeedUrl(permalinkCanonical);
      const timeAnchorSeed = normalizeSeedUrl(timeAnchorCandidate);
      const imageSeed = normalizeImageSeedUrl(imageUrl);
      const primaryExternalLinkSeed = normalizeSeedUrl(primaryExternalLink) || primaryExternalLink;
      let firstImagePath = '';
      try {
        firstImagePath = imageSeed ? (new URL(imageSeed)).pathname : '';
      } catch {
        firstImagePath = '';
      }
      const first120NormalizedText = effectiveText.toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
      const stableCardKey = `${authorGuess || ''}|${(firstTimeMarkerText || '').toLowerCase()}|${firstImagePath}|${first120NormalizedText}`;
      const normalizedSeedText = effectiveText.toLowerCase().replace(/\s+/g, ' ').slice(0, 300);
      const postSeed =
        canonicalSeed ||
        timeAnchorSeed ||
        imageSeed ||
        primaryExternalLinkSeed ||
        stableCardKey ||
        normalizedSeedText ||
        `${idx}:${(child.innerText || '').slice(0, 80)}`;
      const postId = `fb_${hashFromText(postSeed)}`;
      entry.postId = postId;

      if (seenHashes.has(postId)) {
        entry.skipReason = `duplicate_hash (${postId})`;
        bumpSkip(entry.skipReason);
        if (includeDebug) debugEntries.push(entry);
        continue;
      }
      seenHashes.add(postId);

      entry.skipReason = null;
      bumpSkip('captured');
      capturedCount += 1;
      if (includeDebug) debugEntries.push(entry);
      const mic = scoreMicRelevance(effectiveText, externalLinks);

      posts.push({
        id: postId,
        text: effectiveText,
        author: authorGuess || null,
        url: canonicalSeed || timeAnchorSeed || undefined,
        links: externalLinks.length > 0 ? externalLinks : undefined,
        imageUrl: imageUrl || undefined,
        micConfidence: mic.micConfidence,
        micSignals: mic.micSignals
      });

      if (posts.length >= lim) hitLimit = true;
    }

    return { posts, debugEntries, skipStats, capturedCount, candidateCount: nodes.length };
  }, limit, debug);

  if (debug && result.debugEntries.length > 0) {
    console.log(`\n--- DEBUG: extractPosts() — ${result.candidateCount} candidate nodes ---`);
    for (const e of result.debugEntries) {
      const status = e.skipReason ? `SKIP(${e.skipReason})` : 'CAPTURED';
      const markerText = `author=${e.markers?.author ? 1 : 0} img=${e.markers?.image ? 1 : 0} actions=${e.markers?.actions ? 1 : 0} permalink=${e.markers?.permalink ? 1 : 0}`;
      console.log(`  [${e.childIndex}] ${status} | textNodes=${e.textNodes} textLen=${e.textLength} id=${e.postId} | ${markerText}`);
      if (e.authorGuess) console.log(`        authorGuess="${e.authorGuess}"`);
      if (e.preview) console.log(`        "${e.preview}"`);
    }
    console.log(`  skipStats: ${JSON.stringify(result.skipStats)}`);
    console.log('--- END DEBUG ---\n');
  }

  return {
    posts: result.posts,
    meta: {
      skipStats: result.skipStats || {},
      capturedCount: result.capturedCount || 0,
      candidateCount: result.candidateCount || 0
    }
  };
}

async function postToWebhook(apiBase, post) {
  const url = `${apiBase}/admin/fb-group-post`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(post)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`POST ${url} returned ${resp.status}: ${errText}`);
  }

  return resp.json();
}

// In headful mode, find the tab that's already on the FB group page
async function findGroupTab(browser) {
  const pages = await browser.pages();
  for (const page of pages) {
    const url = page.url();
    if (url.includes('groups/nyccomedyscene') || url.includes('groups/198219734918102')) {
      // Verify it's actually loaded (not an error page)
      const hasFeed = await page.evaluate(() => !!document.querySelector('[role="feed"]'));
      if (hasFeed) return page;
    }
  }
  return null;
}

async function main() {
  const { headful, dryRun, debug, help, captureMode, limit, apiBase, groupUrl } = parseArgs(process.argv);

  if (help) {
    printHelp();
    return;
  }

  console.log(
    `FB Group Scraper — mode=${captureMode} limit=${limit} dryRun=${dryRun} debug=${debug} api=${apiBase}` +
    (groupUrl ? ` groupUrl=${groupUrl}` : '')
  );

  let browser;
  let connectedToRunning = false;

  if (headful) {
    const REMOTE_PORT = 9222;
    try {
      const resp = await fetch(`http://127.0.0.1:${REMOTE_PORT}/json/version`);
      const info = await resp.json();
      console.log('Connecting to running Chrome via DevTools...');
      browser = await puppeteer.connect({
        browserWSEndpoint: info.webSocketDebuggerUrl,
        defaultViewport: null,
        protocolTimeout: DEVTOOLS_PROTOCOL_TIMEOUT_MS
      });
      connectedToRunning = true;
    } catch (err) {
      console.warn(
        'Could not connect to Chrome remote debugging; launching a local browser instead.\n' +
        `Reason: ${err.message}`
      );
      browser = await launchBrowser(true);
    }
  } else {
    browser = await launchBrowser(false);
  }

  const summary = { total: 0, posted: 0, duplicate: 0, errors: 0, skipped: 0 };

  try {
    let page;

    if (connectedToRunning) {
      // Headful: find the tab already on the group page to avoid
      // navigating (which breaks the session in connected mode)
      page = await findGroupTab(browser);
      if (page) {
        console.log('Found existing group tab — using it');
        const existingState = await waitForFeed(page, 12000);
        if (existingState.hasLoginForm || (!existingState.hasFeed && existingState.articleCount === 0)) {
          await navigateToGroup(page, groupUrl);
        }
      } else {
        // No group tab open — use first tab and navigate
        const pages = await browser.pages();
        page = pages[0] || await browser.newPage();
        await navigateToGroup(page, groupUrl);
      }
    } else {
      // Headless / standalone headful: new page with cookies
      page = await createLoggedInPage(browser);
      console.log('Facebook login verified');
      await navigateToGroup(page, groupUrl);
    }

    // FB heavily virtualizes group feeds. For max-recall mode we use repeated
    // stationary capture + dense stepwise scrolling within a time budget.
    const captureProfile = CAPTURE_PROFILES[captureMode];
    const runStartMs = Date.now();
    const allPosts = new Map();
    const runDiagnostics = {
      mode: captureMode,
      skipCountsTotal: {},
      capturedPerPass: [],
      newPerRound: [],
      elapsedMs: 0
    };
    let emptyRounds = 0;

    const mergeBatch = (batch) => {
      let newCount = 0;
      for (const post of batch) {
        if (!allPosts.has(post.id)) {
          allPosts.set(post.id, post);
          newCount += 1;
        }
      }
      return newCount;
    };

    const addSkipCounts = (skipStats) => {
      for (const [key, value] of Object.entries(skipStats || {})) {
        runDiagnostics.skipCountsTotal[key] = (runDiagnostics.skipCountsTotal[key] || 0) + value;
      }
    };

    // First pass: repeatedly sample what's currently visible before moving.
    const visiblePasses = captureProfile.stationaryPassDelaysMs.length;
    for (let i = 0; i < visiblePasses; i += 1) {
      const delay = captureProfile.stationaryPassDelaysMs[i];
      if (delay > 0) await sleep(delay);
      const extracted = await extractPosts(page, limit * 3, debug);
      const visibleNew = mergeBatch(extracted.posts);
      addSkipCounts(extracted.meta.skipStats);
      runDiagnostics.capturedPerPass.push({
        phase: 'visible',
        pass: i + 1,
        captured: extracted.meta.capturedCount,
        candidateCount: extracted.meta.candidateCount,
        new: visibleNew
      });
      console.log(`Visible pass ${i + 1}/${visiblePasses}: ${extracted.posts.length} in DOM, ${visibleNew} new (${allPosts.size} total)`);
      if (allPosts.size >= limit) break;
    }

    if (allPosts.size >= limit) {
      const posts = Array.from(allPosts.values()).slice(0, limit);
      runDiagnostics.elapsedMs = Date.now() - runStartMs;
      summary.total = posts.length;
      console.log(`Limit reached during visible pass; extracted ${posts.length} unique posts`);
      if (debug) {
        console.log('\n--- DEBUG: run summary ---');
        console.log(`  mode: ${runDiagnostics.mode}`);
        console.log(`  elapsedMs: ${runDiagnostics.elapsedMs}`);
        console.log(`  skipCountsTotal: ${JSON.stringify(runDiagnostics.skipCountsTotal)}`);
        console.log(`  capturedPerPass: ${JSON.stringify(runDiagnostics.capturedPerPass)}`);
        console.log(`  newPerRound: ${JSON.stringify(runDiagnostics.newPerRound)}`);
        console.log('--- END RUN DEBUG ---\n');
      }
      if (dryRun) {
        console.log('\n--- DRY RUN — posts extracted but not sent ---');
        for (const post of posts) {
          const preview = post.text.slice(0, 120).replace(/\n/g, ' ');
          console.log(`  [${post.id}] ${post.author || 'Unknown'}: ${preview}...`);
          if (typeof post.micConfidence === 'number') {
            const signalPreview = Array.isArray(post.micSignals) && post.micSignals.length
              ? ` (${post.micSignals.join(', ')})`
              : '';
            console.log(`    micConfidence: ${post.micConfidence}${signalPreview}`);
          }
          if (post.imageUrl) console.log(`    image: ${post.imageUrl.slice(0, 100)}...`);
          if (post.links) {
            for (const link of post.links) console.log(`    link: ${link}`);
          }
        }
        summary.skipped = posts.length;
      } else {
        for (const post of posts) {
          try {
            const result = await postToWebhook(apiBase, post);
            if (result.status === 'duplicate') {
              summary.duplicate += 1;
            } else {
              summary.posted += 1;
            }
            const preview = post.text.slice(0, 80).replace(/\n/g, ' ');
            console.log(`  [${result.status || 'processing'}] ${post.id}: ${preview}...`);
          } catch (err) {
            summary.errors += 1;
            console.error(`  [error] ${post.id}: ${err.message}`);
          }
        }
      }
      return;
    }

    const maxScrollRounds = captureProfile.maxScrollRounds;
    console.log(`Scrolling and extracting (limit=${limit}, max scrolls=${maxScrollRounds}, max duration=${Math.round(captureProfile.maxDurationMs / 60000)}m)...`);
    let stopDueToTime = false;
    for (let i = 0; i < maxScrollRounds; i += 1) {
      const elapsedRoundStart = Date.now() - runStartMs;
      if (elapsedRoundStart >= captureProfile.maxDurationMs) {
        stopDueToTime = true;
        break;
      }

      let scrollNew = 0;
      let scrollSeen = 0;

      for (let step = 0; step < captureProfile.stepsPerRound; step += 1) {
        if (Date.now() - runStartMs >= captureProfile.maxDurationMs) {
          stopDueToTime = true;
          break;
        }

        await page.mouse.wheel({ deltaY: captureProfile.deltaY });
        await sleep(captureProfile.settleMs);

        if (captureProfile.longSettleEvery > 0 && (step + 1) % captureProfile.longSettleEvery === 0) {
          await sleep(captureProfile.longSettleMs);
          await dismissDialogs(page);
        }

        const extracted = await extractPosts(page, limit * 3, debug);
        const newCount = mergeBatch(extracted.posts);
        addSkipCounts(extracted.meta.skipStats);
        runDiagnostics.capturedPerPass.push({
          phase: 'scroll',
          round: i + 1,
          step: step + 1,
          captured: extracted.meta.capturedCount,
          candidateCount: extracted.meta.candidateCount,
          new: newCount
        });
        scrollNew += newCount;
        scrollSeen += extracted.posts.length;

        if (captureProfile.backtrackEverySteps > 0 && (step + 1) % captureProfile.backtrackEverySteps === 0) {
          await page.mouse.wheel({ deltaY: captureProfile.backtrackDeltaY });
          await sleep(captureProfile.settleMs);
          const backtrackExtracted = await extractPosts(page, limit * 3, debug);
          const backtrackNew = mergeBatch(backtrackExtracted.posts);
          addSkipCounts(backtrackExtracted.meta.skipStats);
          runDiagnostics.capturedPerPass.push({
            phase: 'backtrack',
            round: i + 1,
            step: step + 1,
            captured: backtrackExtracted.meta.capturedCount,
            candidateCount: backtrackExtracted.meta.candidateCount,
            new: backtrackNew
          });
          scrollNew += backtrackNew;
          scrollSeen += backtrackExtracted.posts.length;
        }

        if (allPosts.size >= limit) break;
      }

      console.log(`  scroll ${i + 1}: ${scrollSeen} sampled, ${scrollNew} new (${allPosts.size} total)`);
      runDiagnostics.newPerRound.push({ round: i + 1, sampled: scrollSeen, new: scrollNew, total: allPosts.size });

      if (allPosts.size >= limit) break;
      if (scrollNew === 0) {
        emptyRounds += 1;
        const elapsedMs = Date.now() - runStartMs;
        if (elapsedMs >= captureProfile.minDurationMs && emptyRounds >= captureProfile.emptyRoundsToStop) {
          console.log(`  No new posts for ${captureProfile.emptyRoundsToStop} scrolls after minimum duration — stopping`);
          break;
        }
      } else {
        emptyRounds = 0;
      }

      if (stopDueToTime) break;
    }

    if (stopDueToTime) {
      console.log(`  Time budget reached (${captureProfile.maxDurationMs}ms) — stopping`);
    }

    const posts = Array.from(allPosts.values()).slice(0, limit);
    runDiagnostics.elapsedMs = Date.now() - runStartMs;
    summary.total = posts.length;
    console.log(`Extracted ${posts.length} unique posts`);

    if (debug) {
      console.log('\n--- DEBUG: run summary ---');
      console.log(`  mode: ${runDiagnostics.mode}`);
      console.log(`  elapsedMs: ${runDiagnostics.elapsedMs}`);
      console.log(`  skipCountsTotal: ${JSON.stringify(runDiagnostics.skipCountsTotal)}`);
      console.log(`  capturedPerPass: ${JSON.stringify(runDiagnostics.capturedPerPass)}`);
      console.log(`  newPerRound: ${JSON.stringify(runDiagnostics.newPerRound)}`);
      console.log('--- END RUN DEBUG ---\n');
    }

    if (dryRun) {
      console.log('\n--- DRY RUN — posts extracted but not sent ---');
      for (const post of posts) {
        const preview = post.text.slice(0, 120).replace(/\n/g, ' ');
        console.log(`  [${post.id}] ${post.author || 'Unknown'}: ${preview}...`);
        if (typeof post.micConfidence === 'number') {
          const signalPreview = Array.isArray(post.micSignals) && post.micSignals.length
            ? ` (${post.micSignals.join(', ')})`
            : '';
          console.log(`    micConfidence: ${post.micConfidence}${signalPreview}`);
        }
        if (post.imageUrl) console.log(`    image: ${post.imageUrl.slice(0, 100)}...`);
        if (post.links) {
          for (const link of post.links) console.log(`    link: ${link}`);
        }
      }
      summary.skipped = posts.length;
    } else {
      for (const post of posts) {
        try {
          const result = await postToWebhook(apiBase, post);
          if (result.status === 'duplicate') {
            summary.duplicate += 1;
          } else {
            summary.posted += 1;
          }
          const preview = post.text.slice(0, 80).replace(/\n/g, ' ');
          console.log(`  [${result.status || 'processing'}] ${post.id}: ${preview}...`);
        } catch (err) {
          summary.errors += 1;
          console.error(`  [error] ${post.id}: ${err.message}`);
        }
      }
    }
  } finally {
    if (connectedToRunning) {
      browser.disconnect();
    } else {
      await browser.close();
    }
  }

  console.log(`\nSummary: ${JSON.stringify(summary)}`);

  if (summary.errors > 0 && summary.posted === 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
