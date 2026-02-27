/**
 * Slotted.co signup availability service
 *
 * Scrapes server-rendered React props from slotted.co pages
 * to get real-time signup slot availability (spots left, capacity, etc.)
 */

const cache = {};          // { slottedId: { data, fetchedAt } }
const CACHE_TTL = 5 * 60 * 1000;  // 5 minutes
let refreshInterval = null;

// Known slotted pages mapped to venue names used in MicFinder
const SLOTTED_PAGES = {
  seshopenmics: {
    url: 'https://slotted.co/seshopenmics',
    venueName: 'Sesh Comedy Open Mic'
  }
};

/**
 * Fetch and parse a slotted.co page for signup data
 */
async function fetchSlottedPage(slottedId) {
  const page = SLOTTED_PAGES[slottedId];
  if (!page) return null;

  const resp = await fetch(page.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!resp.ok) {
    throw new Error(`Slotted fetch failed: ${resp.status}`);
  }

  const html = await resp.text();

  // Extract the SignupSheet React props (not the nav components)
  const match = html.match(/data-react-class="SignupSheet"[^>]*data-react-props="([^"]*)"/);
  if (!match) {
    throw new Error('Could not find SignupSheet React props in slotted page');
  }

  // Decode HTML entities
  const jsonStr = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  const props = JSON.parse(jsonStr);
  const sheet = props.signupSheet?.sheet;
  if (!sheet) {
    throw new Error('No sheet data found in slotted props');
  }

  // Transform events into our slot format
  const slots = [];
  for (const event of (sheet.events || [])) {
    if (event.isPast) continue;

    for (const timeSlot of (event.timeSlots || [])) {
      const startDt = new Date(timeSlot.startDateTime);
      const dateStr = startDt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
      const signupCount = (timeSlot.items || []).reduce(
        (sum, item) => sum + (item.signups?.length || 0), 0
      );
      const capacity = (timeSlot.items || []).reduce(
        (sum, item) => sum + (parseInt(item.atleast) || 0), 0
      );

      slots.push({
        date: dateStr,
        time: timeSlot.display || '',
        signupCount,
        capacity,
        spotsLeft: Math.max(0, capacity - signupCount),
        location: event.location || event.caption || ''
      });
    }
  }

  return {
    venueName: page.venueName,
    sheetTitle: sheet.title || '',
    signupUrl: sheet.publicUrl || page.url,
    slots,
    lastFetched: new Date().toISOString()
  };
}

/**
 * Get slotted data for a given ID (with caching)
 */
async function getSlottedData(slottedId) {
  if (!SLOTTED_PAGES[slottedId]) return null;

  const cached = cache[slottedId];
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL) {
    return cached.data;
  }

  try {
    const data = await fetchSlottedPage(slottedId);
    cache[slottedId] = { data, fetchedAt: Date.now() };
    console.log(`✅ Slotted data refreshed for ${slottedId}: ${data.slots.length} slots`);
    return data;
  } catch (err) {
    console.error(`❌ Slotted fetch error for ${slottedId}:`, err.message);
    // Return stale cache if available
    if (cached) return cached.data;
    return null;
  }
}

/**
 * Start background refresh interval
 */
function startSlottedRefresh() {
  // Initial fetch for all known pages
  for (const id of Object.keys(SLOTTED_PAGES)) {
    getSlottedData(id).catch(() => {});
  }

  // Refresh every 5 minutes
  refreshInterval = setInterval(() => {
    for (const id of Object.keys(SLOTTED_PAGES)) {
      getSlottedData(id).catch(() => {});
    }
  }, CACHE_TTL);

  console.log('🎰 Slotted refresh started');
}

module.exports = { getSlottedData, startSlottedRefresh };
