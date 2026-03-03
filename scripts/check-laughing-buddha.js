#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_URL = 'https://www.laughingbuddhacomedy.com/mics';
const LOCAL_MICS_PATH = path.join(__dirname, '../api/mics.json');

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
  return normalizeSpace(value).toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
}

function toTokenSet(value) {
  return new Set(normalizeText(value).split(/\s+/).filter(Boolean));
}

function overlapScore(a, b) {
  const aTokens = toTokenSet(a);
  const bTokens = toTokenSet(b);
  if (!aTokens.size || !bTokens.size) return 0;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function parseTimeToMinutes(value) {
  const input = normalizeSpace(value).toUpperCase();
  const match = input.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minutes = Number(match[2]);
  const ampm = match[3];
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minutes;
}

function maybeDay(value) {
  const text = normalizeSpace(value);
  for (const day of DAY_NAMES) {
    if (new RegExp(`^${day}\\b`, 'i').test(text)) return day;
  }
  return null;
}

function readLocalMics() {
  const raw = fs.readFileSync(LOCAL_MICS_PATH, 'utf8');
  const mics = JSON.parse(raw);
  return mics.filter((mic) => {
    const sign = normalizeSpace(mic.signUpDetails || '').toLowerCase();
    const host = normalizeText(mic.host || '');
    const name = normalizeText(mic.name || '');
    return sign.includes('laughingbuddhacomedy.com') || host.includes('laughing buddha') || name.includes('laughing buddha');
  });
}

async function scrapeLive(url, headful = false) {
  const launchConfig = {
    headless: headful ? false : 'new',
    defaultViewport: { width: 1365, height: 2000 },
    timeout: 120000,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchConfig);

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Try accepting cookie banner if present.
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const accept = buttons.find((el) => /accept all/i.test((el.textContent || '').trim()));
      if (accept) accept.click();
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Scroll slowly to trigger lazy-loaded cards, then repeat until no new height is discovered.
    await page.evaluate(async () => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      let lastHeight = 0;
      let passes = 0;
      while (passes < 5) {
        const maxScroll = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        if (maxScroll === lastHeight && passes > 0) break;
        lastHeight = maxScroll;
        let pos = 0;
        while (pos < maxScroll) {
          window.scrollTo(0, pos);
          pos += Math.floor(window.innerHeight * 0.5);
          await delay(200);
        }
        window.scrollTo(0, 0);
        await delay(800);
        passes += 1;
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const live = await page.evaluate(() => {
      const dayRegex = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i;
      // Matches a card title like "6:00 PM Mic @The Buddha Room - ..."
      const cardTitleRegex = /^\d{1,2}:\d{2}\s*(?:AM|PM)\b.*@/i;

      // Build sorted list of day section headings by vertical position
      const headingEls = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,[class*="date"],[class*="day"]'))
        .map((el) => {
          const text = (el.textContent || '').trim();
          const dayMatch = text.match(dayRegex);
          // Exclude elements that also contain a time — those are card titles, not headings
          if (!dayMatch || /\d{1,2}:\d{2}/.test(text)) return null;
          const rect = el.getBoundingClientRect();
          return { day: dayMatch[1], top: rect.top + window.scrollY };
        })
        .filter(Boolean)
        .sort((a, b) => a.top - b.top);

      // Anchor on card title elements (they start with "TIME ... @VENUE")
      // Collect all candidates, then keep only the deepest (no candidate is an ancestor of another)
      const allCandidates = Array.from(document.querySelectorAll('h1,h2,h3,h4,p,span,div'))
        .filter((el) => {
          const text = (el.textContent || '').trim();
          return cardTitleRegex.test(text) && text.length < 200;
        });
      const candidateSet = new Set(allCandidates);
      const titleEls = allCandidates.filter((el) => {
        // Keep only if none of its descendants is also a candidate
        return !Array.from(el.querySelectorAll('*')).some((child) => candidateSet.has(child));
      });

      const cards = [];
      const seen = new Set();

      for (const titleEl of titleEls) {
        const titleText = (titleEl.textContent || '').trim();
        const rect0 = titleEl.getBoundingClientRect();
        const y0 = rect0.top + window.scrollY;
        let dayForKey = null;
        for (const h of headingEls) {
          if (h.top <= y0) dayForKey = h.day;
          if (h.top > y0) break;
        }
        // Key on day+title so the same mic title on different days is not skipped
        const seenKey = `${dayForKey || ''}|${titleText}`;
        if (seen.has(seenKey)) continue;
        seen.add(seenKey);

        const rect = titleEl.getBoundingClientRect();
        const y = rect.top + window.scrollY;

        // Parse time and venue directly from the title
        const timeMatch = titleText.match(/^(\d{1,2}:\d{2}\s*(?:AM|PM))\b/i);
        const timeLine = timeMatch ? timeMatch[1] : '';
        const atIdx = titleText.indexOf('@');
        const venueLine = atIdx >= 0 ? titleText.slice(atIdx + 1).split(' - ')[0].trim() : '';

        // Find enclosing card to get the signup link
        let container = titleEl.parentElement;
        for (let i = 0; i < 6 && container; i += 1) {
          if ((container.innerText || '').length > 50) break;
          container = container.parentElement;
        }
        const linkEl = container ? container.querySelector('a[href]') : null;
        const href = linkEl ? linkEl.href : null;

        // Day = last heading above this card
        let day = null;
        for (const h of headingEls) {
          if (h.top <= y) day = h.day;
          if (h.top > y) break;
        }

        cards.push({
          day,
          title: titleText,
          time: timeLine,
          venue: venueLine,
          href,
          raw: titleText
        });
      }

      return cards
        .filter((c) => c.time && c.venue)
        .map((c) => ({
          day: c.day || null,
          title: c.title || null,
          time: c.time || null,
          venue: c.venue || null,
          href: c.href || null,
          raw: c.raw
        }));
    });

    return live;
  } finally {
    await browser.close();
  }
}

function compareData(liveRows, localRows) {
  const localWithKeys = localRows.map((m) => ({
    mic: m,
    day: maybeDay(m.day) || normalizeSpace(m.day),
    startMinutes: parseTimeToMinutes(m.startTime),
    joined: `${m.name || ''} ${m.venueName || ''}`.trim()
  }));

  const usedLocal = new Set();
  const matches = [];
  const unmatchedLive = [];

  for (const live of liveRows) {
    const liveDay = maybeDay(live.day) || null;
    const liveMins = parseTimeToMinutes(live.time || '');
    const liveJoined = `${live.title || ''} ${live.venue || ''}`.trim();

    let best = null;
    for (let i = 0; i < localWithKeys.length; i += 1) {
      if (usedLocal.has(i)) continue;
      const row = localWithKeys[i];
      if (liveDay && row.day && liveDay !== row.day) continue;
      if (liveMins !== null && row.startMinutes !== null && liveMins !== row.startMinutes) continue;

      const score = overlapScore(liveJoined, row.joined);
      // Reject if venues share no tokens at all
      const liveVenueTokens = toTokenSet(live.venue || '');
      const localVenueTokens = toTokenSet(row.mic.venueName || '');
      const venueOverlap = [...liveVenueTokens].some((t) => localVenueTokens.has(t));
      if (!venueOverlap) continue;
      if (!best || score > best.score) best = { idx: i, score };
    }

    if (!best || best.score < 0.18) {
      unmatchedLive.push(live);
      continue;
    }

    usedLocal.add(best.idx);
    const local = localWithKeys[best.idx].mic;
    matches.push({
      live,
      local,
      score: Number(best.score.toFixed(3))
    });
  }

  const missingInLive = localWithKeys
    .map((row, idx) => ({ row, idx }))
    .filter(({ idx }) => !usedLocal.has(idx))
    .map(({ row }) => row.mic);

  const weakMatches = matches.filter((m) => m.score < 0.45);
  return { matches, unmatchedLive, missingInLive, weakMatches };
}

function printSummary(result, liveCount, localCount) {
  console.log('\n=== Laughing Buddha Live vs Local ===');
  console.log(`Live cards: ${liveCount}`);
  console.log(`Local LB-like rows: ${localCount}`);
  console.log(`Matched: ${result.matches.length}`);
  console.log(`Weak matches: ${result.weakMatches.length}`);
  console.log(`Live-only: ${result.unmatchedLive.length}`);
  console.log(`Local-only: ${result.missingInLive.length}`);

  if (result.unmatchedLive.length) {
    console.log('\nLive-only rows:');
    result.unmatchedLive.slice(0, 20).forEach((row) => {
      console.log(`- ${row.day || '?'} ${row.time || '?'} | ${row.title || row.raw}`);
    });
  }

  if (result.missingInLive.length) {
    console.log('\nLocal-only rows:');
    result.missingInLive.slice(0, 20).forEach((row) => {
      console.log(`- ${row.day} ${row.startTime} | ${row.name} @${row.venueName}`);
    });
  }
}

function writeReport(reportPath, payload) {
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
}

function parseArgs(argv) {
  const out = {
    url: DEFAULT_URL,
    reportPath: path.join(__dirname, '../logs/laughing-buddha-compare.json'),
    headful: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url' && argv[i + 1]) out.url = argv[++i];
    else if (arg === '--out' && argv[i + 1]) out.reportPath = path.resolve(argv[++i]);
    else if (arg === '--headful') out.headful = true;
  }
  return out;
}

async function main() {
  const { url, reportPath, headful } = parseArgs(process.argv);

  console.log(`Fetching live page: ${url}`);
  const liveRows = await scrapeLive(url, headful);

  if (!liveRows.length) {
    console.error('No live rows extracted. The site DOM may have changed.');
    process.exit(2);
  }

  const localRows = readLocalMics();
  const result = compareData(liveRows, localRows);

  const payload = {
    generatedAt: new Date().toISOString(),
    url,
    liveCount: liveRows.length,
    localCount: localRows.length,
    ...result
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  writeReport(reportPath, payload);
  printSummary(result, liveRows.length, localRows.length);
  console.log(`\nReport written: ${reportPath}`);
}

main().catch((err) => {
  console.error('\nCheck failed:', err.message);
  if (/WS endpoint URL|executable|browser/i.test(err.message || '')) {
    console.error('Tip: run `npx puppeteer browsers install chrome` and retry.');
  }
  process.exit(1);
});
