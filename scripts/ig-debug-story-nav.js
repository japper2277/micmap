#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Diagnostic helper for Instagram story navigation.
 *
 * Attaches to a real Chrome session via remote debugging, opens a story URL,
 * records the final location, saves screenshots, and dumps clickable elements
 * from the account profile header so story-ring selectors can be debugged.
 *
 * Usage:
 *   node scripts/ig-debug-story-nav.js --url https://www.instagram.com/stories/phoenixcomedynyc/
 *   node scripts/ig-debug-story-nav.js --handle phoenixcomedynyc
 *
 * Prereq:
 *   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
 *     --remote-debugging-port=9222
 *   Then log into Instagram in that Chrome profile first.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const REMOTE_PORT = 9222;
const DEFAULT_HANDLE = 'phoenixcomedynyc';

function parseArgs(argv) {
  const args = {
    handle: null,
    storyUrl: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--handle' && argv[i + 1]) args.handle = argv[++i];
    else if (arg === '--url' && argv[i + 1]) args.storyUrl = argv[++i];
  }

  if (!args.storyUrl && !args.handle) {
    args.handle = DEFAULT_HANDLE;
  }

  if (!args.storyUrl && args.handle) {
    args.storyUrl = `https://www.instagram.com/stories/${args.handle}/`;
  }

  if (!args.handle && args.storyUrl) {
    const match = args.storyUrl.match(/instagram\.com\/stories\/([^/?#]+)\//i);
    if (match) args.handle = match[1];
  }

  if (!args.handle || !args.storyUrl) {
    throw new Error('Provide --handle <instagram_handle> or --url <instagram_story_url>');
  }

  return args;
}

function slugify(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
}

function isStoryUrl(url, handle) {
  return url.includes(`/stories/${handle}/`) || url.includes(`/stories/${handle}?`);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function findExistingStoryPage(browser, storyUrl, handle) {
  const pages = await browser.pages();
  for (const page of pages) {
    const url = page.url();
    if (url === storyUrl || isStoryUrl(url, handle) || url.includes(`/${handle}/`)) {
      return page;
    }
  }
  return null;
}

async function connectToChrome() {
  try {
    const resp = await fetch(`http://127.0.0.1:${REMOTE_PORT}/json/version`);
    const info = await resp.json();
    return puppeteer.connect({
      browserWSEndpoint: info.webSocketDebuggerUrl,
      defaultViewport: null
    });
  } catch {
    throw new Error(
      'Could not connect to Chrome remote debugging.\n' +
      'Start Chrome with:\n' +
      '  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222\n' +
      'Then log into Instagram in that Chrome profile and re-run this script.'
    );
  }
}

async function dismissDialogs(page) {
  let dismissed = true;
  while (dismissed) {
    dismissed = await page.evaluate(() => {
      for (const btn of document.querySelectorAll('button, div[role="button"]')) {
        const text = (btn.textContent || '').trim().toLowerCase();
        if (/^(not now|cancel|close|dismiss|ok)$/.test(text)) {
          btn.click();
          return true;
        }
      }

      const closeBtn = document.querySelector('svg[aria-label="Close"]');
      if (closeBtn) {
        closeBtn.closest('button, div[role="button"]')?.click();
        return true;
      }

      return false;
    });

    if (dismissed) await sleep(1500);
  }
}

async function saveScreenshot(page, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage: true });
}

async function clickViewStoryPrompt(page) {
  const clickMethod = await page.evaluate(() => {
    const normalized = (value) => (value || '').trim().toLowerCase().replace(/\s+/g, ' ');

    for (const el of document.querySelectorAll('button, a, div[role="button"], span[role="button"]')) {
      const text = normalized(el.textContent);
      const aria = normalized(el.getAttribute('aria-label'));
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

  if (!clickMethod) return null;

  await sleep(3000);
  return clickMethod;
}

async function collectClickableSummary(page, handle) {
  return page.evaluate((targetHandle) => {
    const root = document.querySelector('header') || document.body;
    const viewportHeight = window.innerHeight || 0;
    const viewportWidth = window.innerWidth || 0;
    const candidates = Array.from(
      root.querySelectorAll('a, button, div[role="button"], canvas, img')
    );

    return candidates
      .map((el, index) => {
        const rect = el.getBoundingClientRect();
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
        const href = el.href || null;
        const aria = el.getAttribute('aria-label');
        const alt = el.getAttribute('alt');
        const role = el.getAttribute('role');
        const cls = typeof el.className === 'string' ? el.className : '';
        const inHeaderZone = rect.top < Math.max(320, viewportHeight * 0.45);
        const storyRelated =
          !!(href && href.includes('/stories/')) ||
          /story/i.test(text || '') ||
          /story/i.test(aria || '') ||
          /profile picture/i.test(alt || '') ||
          el.tagName === 'CANVAS';

        return {
          index,
          tag: el.tagName,
          text: text || null,
          href,
          role,
          ariaLabel: aria,
          alt,
          className: cls || null,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          inHeaderZone,
          storyRelated,
          targetHandleMentioned:
            text?.toLowerCase().includes(targetHandle.toLowerCase()) ||
            href?.toLowerCase().includes(targetHandle.toLowerCase()) ||
            aria?.toLowerCase().includes(targetHandle.toLowerCase()) ||
            alt?.toLowerCase().includes(targetHandle.toLowerCase()) ||
            false
        };
      })
      .filter((item) =>
        item.inHeaderZone ||
        item.storyRelated ||
        item.targetHandleMentioned ||
        (item.rect.width >= 44 && item.rect.height >= 44 && item.rect.x < viewportWidth)
      )
      .slice(0, 200);
  }, handle);
}

async function collectPageSummary(page) {
  return page.evaluate(() => ({
    title: document.title,
    bodyTextSample: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 600)
  }));
}

async function main() {
  const { handle, storyUrl } = parseArgs(process.argv);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeHandle = slugify(handle);
  const outDir = path.join(__dirname, '../logs');
  const initialShot = path.join(outDir, `ig-debug-story-initial-${safeHandle}-${stamp}.png`);
  const profileShot = path.join(outDir, `ig-debug-story-profile-${safeHandle}-${stamp}.png`);
  const reportPath = path.join(outDir, `ig-debug-story-report-${safeHandle}-${stamp}.json`);

  const browser = await connectToChrome();
  const existingPage = await findExistingStoryPage(browser, storyUrl, handle);
  const page = existingPage || await browser.newPage();

  try {
    if (existingPage) {
      console.log(`Using existing tab: ${page.url()}`);
      await page.bringToFront();
      await sleep(1500);
    } else {
      console.log(`Opening story URL: ${storyUrl}`);
      await page.goto(storyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(5000);
      await dismissDialogs(page);
      await sleep(1500);
    }

    const firstUrl = page.url();
    const firstSummary = await collectPageSummary(page);
    await saveScreenshot(page, initialShot);
    console.log(`Final URL after direct story nav: ${firstUrl}`);
    console.log(`Saved screenshot: ${initialShot}`);

    let viewStoryClick = null;
    let afterClickUrl = null;
    let afterClickSummary = null;

    if (isStoryUrl(firstUrl, handle)) {
      viewStoryClick = await clickViewStoryPrompt(page);
      if (viewStoryClick) {
        console.log(`Clicked View story prompt via ${viewStoryClick}`);
        await dismissDialogs(page);
        await sleep(1500);
        afterClickUrl = page.url();
        afterClickSummary = await collectPageSummary(page);
      }
    }

    let profileUrl = null;
    let profileSummary = null;
    let clickableSummary = [];

    if (!isStoryUrl(firstUrl, handle) && !afterClickUrl) {
      profileUrl = `https://www.instagram.com/${handle}/`;
      console.log(`Redirect detected. Opening profile: ${profileUrl}`);
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(5000);
      await dismissDialogs(page);
      await sleep(1500);

      profileSummary = await collectPageSummary(page);
      clickableSummary = await collectClickableSummary(page, handle);
      await saveScreenshot(page, profileShot);
      console.log(`Saved profile screenshot: ${profileShot}`);
      console.log(`Collected ${clickableSummary.length} clickable profile candidates`);
    }

    const report = {
      generatedAt: new Date().toISOString(),
      handle,
      requestedStoryUrl: storyUrl,
      directNavigation: {
        finalUrl: firstUrl,
        landedInStoryViewer: isStoryUrl(firstUrl, handle),
        page: firstSummary,
        screenshotPath: initialShot,
        clickedViewStoryPrompt: viewStoryClick,
        afterClickUrl,
        afterClickPage: afterClickSummary
      },
      profileFallback: profileUrl
        ? {
            profileUrl,
            finalUrl: page.url(),
            page: profileSummary,
            screenshotPath: profileShot,
            clickableCandidates: clickableSummary
          }
        : null
    };

    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Report written: ${reportPath}`);
  } finally {
    if (!existingPage) await page.close();
    browser.disconnect();
  }
}

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});
