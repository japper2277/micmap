/**
 * Bushwick Comedy Club signup availability service
 *
 * Scrapes the Wix Events sitemap + individual event pages for JSON-LD
 * structured data to get real-time signup slot availability.
 *
 * No Puppeteer needed - Wix server-renders the JSON-LD in the HTML.
 */

const cache = { data: null, fetchedAt: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let refreshInterval = null;

const SITEMAP_URL = 'https://www.bushwickcomedy.com/event-pages-sitemap.xml';
const VENUE_NAME = 'Bushwick Comedy Club';

// Match open mic event URLs (filter out showcases, specials, etc.)
const OPEN_MIC_PATTERN = /open-mic/i;

/**
 * Fetch the event-pages sitemap and extract open mic URLs for upcoming dates
 */
async function getOpenMicUrls() {
  const resp = await fetch(SITEMAP_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MicFinderBot/1.0)',
      'Accept': 'application/xml,text/xml'
    }
  });

  if (!resp.ok) {
    throw new Error(`Sitemap fetch failed: ${resp.status}`);
  }

  const xml = await resp.text();

  // Extract all <loc> URLs from the sitemap
  const urls = [];
  const locRegex = /<loc>([^<]+)<\/loc>/g;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1];
    if (OPEN_MIC_PATTERN.test(url)) {
      urls.push(url);
    }
  }

  // Filter to next 7 days only (no need to scrape months of future events)
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
 * Fetch a single event page and extract JSON-LD data
 */
async function fetchEventPage(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html'
    }
  });

  if (!resp.ok) return null;

  const html = await resp.text();

  // Extract JSON-LD script
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (!jsonLdMatch) return null;

  try {
    const data = JSON.parse(jsonLdMatch[1]);

    // Handle both single object and array of objects
    const event = Array.isArray(data) ? data.find(d => d['@type'] === 'Event') : (data['@type'] === 'Event' ? data : null);
    if (!event) return null;

    return event;
  } catch {
    return null;
  }
}

/**
 * Scrape all upcoming open mic events and return slot data
 */
async function fetchBushwickData() {
  const urls = await getOpenMicUrls();
  console.log(`[Bushwick] Found ${urls.length} upcoming open mic URLs`);

  // Fetch pages in parallel (max 10 concurrent to be polite)
  const BATCH_SIZE = 10;
  const events = [];

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(fetchEventPage));
    for (const event of results) {
      if (event) events.push(event);
    }
  }

  // Transform into our slot format
  const slots = [];
  for (const event of events) {
    const startDate = new Date(event.startDate);
    const dateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // Format time from startDate
    const timeStr = startDate.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).toLowerCase().replace(/\s/g, ''); // "7:30pm"

    // Extract capacity from description (e.g., "12 comics, 5 minutes each")
    const capacityMatch = (event.description || '').match(/(\d+)\s*comics/i);
    const capacity = capacityMatch ? parseInt(capacityMatch[1]) : 12;

    // Check availability from offers
    const offers = event.offers;
    const isSoldOut = offers?.availability === 'https://schema.org/SoldOut' ||
      (offers?.offers || []).every(o => o.availability === 'https://schema.org/SoldOut');

    slots.push({
      date: dateStr,
      time: timeStr,
      capacity,
      soldOut: isSoldOut,
      price: offers?.lowPrice || '5.13',
      eventUrl: event.location?.url || event.url || '',
      name: event.name || ''
    });
  }

  // Sort by date + time
  slots.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  return {
    venueName: VENUE_NAME,
    slots,
    lastFetched: new Date().toISOString()
  };
}

/**
 * Get Bushwick data (with caching)
 */
async function getBushwickData() {
  if (cache.data && (Date.now() - cache.fetchedAt) < CACHE_TTL) {
    return cache.data;
  }

  try {
    const data = await fetchBushwickData();
    cache.data = data;
    cache.fetchedAt = Date.now();
    console.log(`[Bushwick] Data refreshed: ${data.slots.length} slots`);
    return data;
  } catch (err) {
    console.error(`[Bushwick] Fetch error:`, err.message);
    if (cache.data) return cache.data;
    return null;
  }
}

/**
 * Start background refresh interval
 */
function startBushwickRefresh() {
  getBushwickData().catch(() => {});

  refreshInterval = setInterval(() => {
    getBushwickData().catch(() => {});
  }, CACHE_TTL);

  console.log('[Bushwick] Refresh started');
}

module.exports = { getBushwickData, startBushwickRefresh };
