#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Scrapes Comedians on the Loose (comediansontheloose.com) signup slot availability
 * from their embedded Simpl-e-Schedule (Wix) widget.
 *
 * Outputs slot data (day, time, spotsLeft, capacity) and optionally POSTs
 * to the MicMap API so it can be served to the frontend.
 *
 * Usage:
 *   node scripts/scrape-cotl-slots.js              # scrape + print
 *   node scripts/scrape-cotl-slots.js --post        # scrape + POST to API
 *   node scripts/scrape-cotl-slots.js --headful     # visible browser (debug)
 *   node scripts/scrape-cotl-slots.js --out path    # save JSON to file
 */

const puppeteer = require('puppeteer');

const DEFAULT_URL = 'https://www.comediansontheloose.com/open-mics';
const DEFAULT_API = process.env.MICMAP_API_BASE || 'https://micmap-production.up.railway.app';
const VENUE_NAME = 'Black Cat LES';

function parseArgs(argv) {
  const out = {
    url: DEFAULT_URL,
    apiBase: DEFAULT_API,
    headful: false,
    post: false,
    outFile: null
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--headful') out.headful = true;
    else if (arg === '--post') out.post = true;
    else if (arg === '--url' && argv[i + 1]) out.url = argv[++i];
    else if (arg === '--api' && argv[i + 1]) out.apiBase = argv[++i];
    else if (arg === '--out' && argv[i + 1]) out.outFile = argv[++i];
  }
  return out;
}

/**
 * Compute YYYY-MM-DD for the next occurrence of a day name (or today if it matches).
 * Uses America/New_York timezone.
 */
function dayNameToDate(dayName) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const targetIdx = days.findIndex(d => d.toLowerCase() === dayName.toLowerCase());
  if (targetIdx === -1) return null;

  // Get current date in ET
  const now = new Date();
  const etStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const etDate = new Date(etStr + 'T12:00:00');
  const todayIdx = etDate.getDay();

  let daysUntil = targetIdx - todayIdx;
  if (daysUntil < 0) daysUntil += 7;

  const result = new Date(etDate);
  result.setDate(etDate.getDate() + daysUntil);
  return result.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
}

/**
 * Parse a full date string like "Tuesday, March 3" or "March 3, 2026" → YYYY-MM-DD
 */
function parseFullDate(text) {
  // "March 3, 2026" or "March 3"
  const withYear = text.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (withYear) {
    const d = new Date(`${withYear[1]} ${withYear[2]}, ${withYear[3]}`);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    }
  }
  // "Tuesday, March 3" — assume current or upcoming year
  const withDay = text.match(/(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2})/);
  if (withDay) {
    const year = new Date().getFullYear();
    const d = new Date(`${withDay[1]} ${withDay[2]}, ${year}`);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    }
  }
  return null;
}

async function scrape(url, headful) {
  const launchConfig = {
    headless: headful ? false : 'new',
    defaultViewport: { width: 1280, height: 900 },
    timeout: 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchConfig);
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Accept cookie banner if present
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const accept = btns.find(el => /accept/i.test((el.textContent || '').trim()));
      if (accept) accept.click();
    }).catch(() => {});

    await new Promise(r => setTimeout(r, 2000));

    // Find Simpl-e-Schedule iframe (hosted on wix.shareiiit.com or similar)
    const iframeEl = await page.waitForSelector(
      'iframe[src*="shareiiit"], iframe[src*="simpl-e-schedule"], iframe[title*="schedule" i], iframe[title*="signup" i]',
      { timeout: 20000 }
    ).catch(() => null);

    if (!iframeEl) {
      // Fallback: try any iframe that might be the schedule widget
      console.warn('Could not find schedule iframe by known selectors, trying all iframes...');
      const frames = page.frames();
      for (const f of frames) {
        const u = f.url();
        if (u && (u.includes('shareiiit') || u.includes('schedule') || u.includes('signup'))) {
          console.log('Found candidate frame:', u);
        }
      }
    }

    // Try to get iframe content frame
    let frame = null;
    if (iframeEl) {
      frame = await iframeEl.contentFrame();
    }

    // If no dedicated frame, search all page frames
    if (!frame) {
      for (const f of page.frames()) {
        const u = f.url();
        if (u && (u.includes('shareiiit') || u.includes('wix.com'))) {
          frame = f;
          break;
        }
      }
    }

    if (!frame) {
      // Last resort: scrape main page directly (in case widget is inline)
      console.warn('No iframe found — scraping main page for spots data');
      frame = page.mainFrame();
    }

    // Wait a bit for iframe content to load
    await new Promise(r => setTimeout(r, 3000));

    const rawSlots = await frame.evaluate(() => {
      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      // Find all leaf-node elements containing "Spots left:"
      const allEls = Array.from(document.querySelectorAll('*'));
      const spotsEls = allEls.filter(el => {
        if (el.children.length > 0) return false; // leaf only
        return /spots\s*left\s*:/i.test(el.textContent || '');
      });

      const slots = [];

      for (const spotsEl of spotsEls) {
        const spotsText = spotsEl.textContent || '';
        const m = spotsText.match(/spots\s*left\s*:\s*(\d+)\s*\/\s*(\d+)/i);
        if (!m) continue;

        const spotsLeft = parseInt(m[1]);
        const capacity = parseInt(m[2]);

        // Walk up DOM to find enclosing card with time + day info
        let container = spotsEl;
        for (let i = 0; i < 10 && container; i++) {
          container = container.parentElement;
          const text = container ? (container.innerText || '') : '';
          if (/\d{1,2}:\d{2}\s*(AM|PM)/i.test(text)) break;
        }

        const cardText = container ? (container.innerText || '') : spotsText;

        // Extract time (first occurrence of H:MM AM/PM)
        const timeMatch = cardText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
        const time = timeMatch ? timeMatch[1].trim() : null;

        // Extract day name
        const dayMatch = cardText.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
        const day = dayMatch ? dayMatch[1] : null;

        // Extract full date string (e.g., "March 3, 2026" or "March 3")
        const fullDateMatch = cardText.match(/\b([A-Za-z]+ \d{1,2}(?:,\s*\d{4})?)\b/);
        const fullDate = fullDateMatch ? fullDateMatch[1] : null;

        slots.push({ time, day, fullDate, spotsLeft, capacity, cardText: cardText.slice(0, 300) });
      }

      return slots;
    });

    console.log(`Found ${rawSlots.length} raw slot(s) in iframe`);
    if (rawSlots.length > 0) {
      console.log('Sample:', JSON.stringify(rawSlots[0], null, 2));
    }

    // Normalize: compute actual YYYY-MM-DD dates
    const slots = [];
    for (const raw of rawSlots) {
      if (!raw.time) {
        console.warn('  Skipping slot with no time:', raw.cardText.slice(0, 80));
        continue;
      }

      let date = null;

      // Try full date string first ("March 3, 2026")
      if (raw.fullDate) {
        date = parseFullDate(raw.fullDate);
      }

      // Fall back to day name ("Tuesday")
      if (!date && raw.day) {
        date = dayNameToDate(raw.day);
      }

      if (!date) {
        console.warn('  Skipping slot with no parseable date:', raw.cardText.slice(0, 80));
        continue;
      }

      // Normalize time to lowercase for render.js regex matching ("7:30pm")
      const timeNorm = raw.time.replace(/\s+/g, '').toLowerCase(); // "7:30pm"

      slots.push({ date, time: timeNorm, spotsLeft: raw.spotsLeft, capacity: raw.capacity });
      console.log(`  Slot: ${date} ${timeNorm} — ${raw.spotsLeft}/${raw.capacity} spots`);
    }

    return { venueName: VENUE_NAME, slots, lastFetched: new Date().toISOString() };
  } finally {
    await browser.close();
  }
}

async function postToApi(apiBase, data) {
  const url = `${apiBase}/admin/cotl-slots`;
  const adminToken = process.env.MICMAP_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error('MICMAP_ADMIN_TOKEN not set');
  }
  console.log(`\nPOSTing to ${url}...`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken
    },
    body: JSON.stringify(data)
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`POST failed ${res.status}: ${text}`);
  }
  console.log('API response:', text);
}

async function main() {
  const { url, apiBase, headful, post, outFile } = parseArgs(process.argv);

  console.log(`Scraping COTL slots from: ${url}`);
  const data = await scrape(url, headful);

  console.log(`\n=== COTL Slots ===`);
  console.log(`Venue: ${data.venueName}`);
  console.log(`Slots found: ${data.slots.length}`);
  data.slots.forEach(s => {
    console.log(`  ${s.date} ${s.time} — ${s.spotsLeft}/${s.capacity} spots`);
  });

  if (outFile) {
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
    console.log(`\nWrote: ${outFile}`);
  }

  if (post) {
    await postToApi(apiBase, data);
  }
}

main().catch(err => {
  console.error('\nScrape failed:', err.message);
  if (/WS endpoint URL|executable|browser/i.test(err.message || '')) {
    console.error('Tip: run `npx puppeteer browsers install chrome` and retry.');
  }
  process.exit(1);
});
