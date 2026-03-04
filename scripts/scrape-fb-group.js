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
 */

require('dotenv').config({ path: require('path').join(__dirname, '../api/.env') });

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const GROUP_URL = 'https://www.facebook.com/groups/nyccomedyscene';
const GROUP_URL_NUMERIC = 'https://www.facebook.com/groups/198219734918102';
const COOKIES_PATH = path.join(__dirname, '../logs/fb-cookies.json');
const IS_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
const DEFAULT_API_BASE = process.env.MICMAP_API_BASE || 'https://micmap-production.up.railway.app';

function parseArgs(argv) {
  const out = {
    headful: false,
    dryRun: false,
    limit: 20,
    apiBase: DEFAULT_API_BASE
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--headful') out.headful = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--limit' && argv[i + 1]) out.limit = parseInt(argv[++i], 10);
    else if (arg === '--api' && argv[i + 1]) out.apiBase = argv[++i];
  }

  return out;
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
  await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const url = page.url();
  if (url.includes('/login') || url.includes('checkpoint')) return false;

  const hasLoginForm = await page.evaluate(() => {
    return !!document.querySelector('input[name="email"]') && !!document.querySelector('input[name="pass"]');
  });

  return !hasLoginForm;
}

async function dismissDialogs(page) {
  const dismissed = await page.evaluate(() => {
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
  });

  if (dismissed.length) {
    console.log(`Dismissed dialogs: ${dismissed.join(', ')}`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

async function scrollAndLoad(page, scrollCount) {
  for (let i = 0; i < scrollCount; i += 1) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await dismissDialogs(page);
  }
}

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length && i < 200; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

async function extractPosts(page, limit) {
  return page.evaluate((lim) => {
    const feed = document.querySelector('[role="feed"]');
    if (!feed) return [];

    const posts = [];
    const seenHashes = new Set();

    for (const child of feed.children) {
      if (posts.length >= lim) break;

      // Extract text from dir="auto" divs, deduplicated
      const textParts = [];
      const seen = new Set();
      child.querySelectorAll('div[dir="auto"]').forEach((d) => {
        const t = d.textContent.trim();
        if (t.length > 15 && !seen.has(t) && t !== 'Facebook') {
          seen.add(t);
          textParts.push(t);
        }
      });
      const text = textParts.join('\n');
      if (text.length < 20) continue;

      // Generate stable ID from text content
      let hash = 0;
      for (let i = 0; i < text.length && i < 200; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
      }
      const postId = `fb_${Math.abs(hash)}`;
      if (seenHashes.has(postId)) continue;
      seenHashes.add(postId);

      // Extract author from user profile links
      let author = null;
      for (const a of child.querySelectorAll('a[href*="/user/"]')) {
        const t = a.textContent.trim();
        if (t.length > 1 && t.length < 60 && t !== 'Facebook') {
          author = t;
          break;
        }
      }

      // Extract external links (signup URLs, etc.)
      // FB wraps external links as l.facebook.com/l.php?u=<encoded_url>
      // Link preview cards use aria-label with the site name (href points to FB)
      const externalLinks = [];
      const seenLinks = new Set();
      for (const a of child.querySelectorAll('a[href]')) {
        const href = a.href;
        let url = null;

        // 1. Facebook redirect wrapper (l.facebook.com/l.php?u=...)
        const m = href.match(/l\.facebook\.com\/l\.php\?u=([^&]+)/);
        if (m) {
          try { url = decodeURIComponent(m[1]).split('?fbclid')[0]; } catch {}
        }

        // 2. Link text that looks like a URL
        if (!url) {
          const linkText = a.textContent.trim();
          if (/^https?:\/\/[^\s]+/.test(linkText) && !linkText.includes('facebook.com')) {
            url = linkText;
          }
        }

        // 3. Link preview cards: aria-label contains site name + title
        //    (href is facebook.com/groups/... but the label has the destination)
        if (!url) {
          const label = a.getAttribute('aria-label') || '';
          // Match known signup platforms in aria-label
          const platformMatch = label.match(/\b(tixol\w*|punchup|slotted|eventbrite|dice\.fm|shotgun\w*|humanitix|lu\.ma)\b/i);
          if (platformMatch) {
            // Include the aria-label as context since we can't get the actual URL
            url = `[link-preview] ${label}`;
          }
        }

        if (url && !seenLinks.has(url) && !url.includes('facebook.com')) {
          seenLinks.add(url);
          externalLinks.push(url);
        }
      }

      // Try to find a FB permalink (some posts have them)
      let permalink = null;
      for (const a of child.querySelectorAll('a[href]')) {
        const href = a.href;
        const pm = href.match(/\/permalink\/(\d+)/) ||
                   href.match(/\/posts\/(\d+)/) ||
                   href.match(/story_fbid=(\d+)/);
        if (pm) {
          permalink = href;
          break;
        }
      }

      // Also extract URLs from plain text (not wrapped in <a> tags)
      const urlRegex = /https?:\/\/[^\s),]+/g;
      let match;
      while ((match = urlRegex.exec(text)) !== null) {
        const url = match[0].replace(/[.)]+$/, ''); // trim trailing punctuation
        if (!seenLinks.has(url) && !url.includes('facebook.com')) {
          seenLinks.add(url);
          externalLinks.push(url);
        }
      }

      posts.push({
        id: postId,
        text,
        author,
        url: permalink,
        links: externalLinks.length > 0 ? externalLinks : undefined
      });
    }

    return posts;
  }, limit);
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
  const { headful, dryRun, limit, apiBase } = parseArgs(process.argv);

  console.log(`FB Group Scraper — limit=${limit} dryRun=${dryRun} api=${apiBase}`);

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
        defaultViewport: null
      });
      connectedToRunning = true;
    } catch {
      console.error(
        'Could not connect to Chrome. Start Chrome with remote debugging:\n' +
        '  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome ' +
        '--remote-debugging-port=9222 --user-data-dir="logs/fb-chrome-profile"\n' +
        'Then re-run this script.'
      );
      process.exit(1);
    }
  } else {
    browser = await puppeteer.launch({
      headless: 'new',
      defaultViewport: { width: 1280, height: 900 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : {})
    });
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
      } else {
        // No group tab open — use first tab and navigate
        const pages = await browser.pages();
        page = pages[0] || await browser.newPage();
        console.log(`Navigating to ${GROUP_URL}`);
        await page.goto(GROUP_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise((resolve) => setTimeout(resolve, 4000));

        // Verify it loaded
        const hasFeed = await page.evaluate(() => !!document.querySelector('[role="feed"]'));
        if (!hasFeed) {
          throw new Error(
            'Could not load group feed. Make sure you are:\n' +
            '  1. Logged into Facebook in the Chrome window\n' +
            '  2. A member of the NYC Comedy Scene group\n' +
            '  3. Navigate to the group page manually, then re-run this script'
          );
        }
      }
    } else {
      // Headless: new page with cookies
      page = await browser.newPage();
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
      console.log('Facebook login verified');

      console.log(`Navigating to ${GROUP_URL}`);
      await page.goto(GROUP_URL, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await dismissDialogs(page);

      const pageUrl = page.url();
      if (pageUrl.includes('/login') || pageUrl.includes('checkpoint')) {
        throw new Error('Redirected away from group — session may be invalid');
      }
    }

    // Scroll to top for consistent results
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // FB virtualizes the DOM (~5-10 posts at once), so we scroll
    // and extract repeatedly, accumulating unique posts until we
    // stop finding new ones or hit the limit.
    const allPosts = new Map();
    const MAX_SCROLLS = 30;
    let emptyRounds = 0;

    // Extract top-of-feed posts before any scrolling
    const topBatch = await extractPosts(page, limit * 2);
    for (const post of topBatch) allPosts.set(post.id, post);
    console.log(`Top of feed: ${topBatch.length} posts`);

    console.log(`Scrolling and extracting (limit=${limit}, max scrolls=${MAX_SCROLLS})...`);
    for (let i = 0; i < MAX_SCROLLS; i += 1) {
      const batch = await extractPosts(page, limit * 2);
      let newCount = 0;
      for (const post of batch) {
        if (!allPosts.has(post.id)) {
          allPosts.set(post.id, post);
          newCount += 1;
        }
      }

      console.log(`  scroll ${i + 1}: ${batch.length} in DOM, ${newCount} new (${allPosts.size} total)`);

      if (allPosts.size >= limit) break;
      if (newCount === 0) {
        emptyRounds += 1;
        if (emptyRounds >= 3) {
          console.log('  No new posts for 3 scrolls — stopping');
          break;
        }
      } else {
        emptyRounds = 0;
      }

      // Use mouse wheel to trigger FB's infinite scroll naturally
      for (let s = 0; s < 5; s += 1) {
        await page.mouse.wheel({ deltaY: 1200 });
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await dismissDialogs(page);
    }

    const posts = Array.from(allPosts.values()).slice(0, limit);
    summary.total = posts.length;
    console.log(`Extracted ${posts.length} unique posts`);

    if (dryRun) {
      console.log('\n--- DRY RUN — posts extracted but not sent ---');
      for (const post of posts) {
        const preview = post.text.slice(0, 120).replace(/\n/g, ' ');
        console.log(`  [${post.id}] ${post.author || 'Unknown'}: ${preview}...`);
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
