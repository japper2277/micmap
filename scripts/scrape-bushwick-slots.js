#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Scrapes Bushwick Comedy Club (bushwickcomedy.com) signup slot availability
 * from their Wix Events pages by reading the quantity dropdown max value.
 *
 * Outputs slot data (date, time, spotsLeft, capacity) and optionally POSTs
 * to the MicMap API so it can be served to the frontend.
 *
 * Usage:
 *   node scripts/scrape-bushwick-slots.js              # scrape + print
 *   node scripts/scrape-bushwick-slots.js --post        # scrape + POST to API
 *   node scripts/scrape-bushwick-slots.js --headful     # visible browser (debug)
 *   node scripts/scrape-bushwick-slots.js --out path    # save JSON to file
 */

const puppeteer = require('puppeteer');

const SITEMAP_URL = 'https://www.bushwickcomedy.com/event-pages-sitemap.xml';
const DEFAULT_API = process.env.MICMAP_API_BASE || 'https://micmap-production.up.railway.app';
const VENUE_NAME = 'Bushwick Comedy Club';
const OPEN_MIC_PATTERN = /open-mic/i;

function parseArgs(argv) {
  const out = {
    apiBase: DEFAULT_API,
    headful: false,
    post: false,
    outFile: null
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--headful') out.headful = true;
    else if (arg === '--post') out.post = true;
    else if (arg === '--api' && argv[i + 1]) out.apiBase = argv[++i];
    else if (arg === '--out' && argv[i + 1]) out.outFile = argv[++i];
  }
  return out;
}

/**
 * Fetch the Wix event-pages sitemap and return open mic URLs for the next 7 days.
 */
async function getOpenMicUrls() {
  const resp = await fetch(SITEMAP_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MicFinderBot/1.0)', 'Accept': 'application/xml,text/xml' }
  });
  if (!resp.ok) throw new Error(`Sitemap fetch failed: ${resp.status}`);

  const xml = await resp.text();
  const urls = [];
  const locRegex = /<loc>([^<]+)<\/loc>/g;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    if (OPEN_MIC_PATTERN.test(match[1])) urls.push(match[1]);
  }

  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const maxDateStr = weekOut.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  return urls.filter(url => {
    const dateMatch = url.match(/(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) return false;
    return dateMatch[1] >= todayStr && dateMatch[1] <= maxDateStr;
  });
}

/**
 * Extract slot data from a single Bushwick event page using Puppeteer.
 * Clicks the Wix quantity dropdown and reads max value = spots remaining.
 */
async function scrapeEventPage(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  const data = await page.evaluate(() => {
    const title = document.querySelector('[data-hook="event-title"]')?.textContent?.trim() || '';
    const dateText = document.querySelector('[data-hook="event-full-date"]')?.textContent?.trim() || '';

    // Click the dropdown to expand it
    const picker = document.querySelector('[data-hook="quantity-picker"]');
    if (picker) {
      const trigger = picker.querySelector('[data-hook="dropdown-base"]') || picker;
      trigger.click();
    }

    return { title, dateText, hasPicker: !!picker };
  });

  if (!data.hasPicker) {
    console.warn(`  No quantity picker found on: ${url}`);
    return null;
  }

  // Wait for dropdown to open
  await new Promise(r => setTimeout(r, 800));

  // Read all dropdown option values
  const spotsLeft = await page.evaluate(() => {
    const options = document.querySelectorAll('[role="option"]');
    const nums = [...options].map(el => parseInt(el.textContent.trim())).filter(n => !isNaN(n));
    return nums.length > 0 ? Math.max(...nums) : 0;
  });

  // Close the dropdown by clicking elsewhere
  await page.evaluate(() => document.body.click());

  // Parse date from the event date text: "Mar 06, 2026, 6:30 PM – 7:30 PM"
  const dateMatch = data.dateText.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (!dateMatch) {
    console.warn(`  Could not parse date from: "${data.dateText}"`);
    return null;
  }

  const dateObj = new Date(`${dateMatch[1]} ${dateMatch[2]}, ${dateMatch[3]}`);
  const dateStr = dateObj.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const timeStr = dateMatch[4].replace(/\s+/g, '').toLowerCase(); // "6:30pm"

  // Capacity from description
  const capacity = await page.evaluate(() => {
    const desc = document.querySelector('[data-hook="event-description"]')?.textContent || '';
    const m = desc.match(/(\d+)\s*comics/i);
    return m ? parseInt(m[1]) : 12;
  });

  return {
    date: dateStr,
    time: timeStr,
    spotsLeft,
    capacity,
    name: data.title,
    eventUrl: url
  };
}

async function scrape(headful) {
  console.log('Fetching sitemap...');
  const urls = await getOpenMicUrls();
  console.log(`Found ${urls.length} open mic URLs for next 7 days`);

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
  const slots = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    for (const url of urls) {
      console.log(`\nScraping: ${url}`);
      try {
        const slot = await scrapeEventPage(page, url);
        if (slot) {
          slots.push(slot);
          const status = slot.spotsLeft === 0 ? 'SOLD OUT' : `${slot.spotsLeft}/${slot.capacity} spots`;
          console.log(`  ${slot.date} ${slot.time} — ${status} — ${slot.name}`);
        }
      } catch (err) {
        console.warn(`  Error scraping ${url}: ${err.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  slots.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return { venueName: VENUE_NAME, slots, lastFetched: new Date().toISOString() };
}

async function postToApi(apiBase, data) {
  const url = `${apiBase}/admin/bushwick-slots`;
  console.log(`\nPOSTing to ${url}...`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST failed ${res.status}: ${text}`);
  console.log('API response:', text);
}

async function main() {
  const { apiBase, headful, post, outFile } = parseArgs(process.argv);

  const data = await scrape(headful);

  console.log(`\n=== Bushwick Comedy Slots ===`);
  console.log(`Venue: ${data.venueName}`);
  console.log(`Slots found: ${data.slots.length}`);
  data.slots.forEach(s => {
    const status = s.spotsLeft === 0 ? 'SOLD OUT' : `${s.spotsLeft}/${s.capacity} spots`;
    console.log(`  ${s.date} ${s.time} — ${status} — ${s.name}`);
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
