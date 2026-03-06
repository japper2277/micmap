/**
 * Square Checkout signup availability service
 *
 * Scrapes window.bootstrap JSON from Square checkout pages
 * to get real-time signup slot availability.
 */

const cache = {};          // { url: { data, fetchedAt } }
const CACHE_TTL = 5 * 60 * 1000;  // 5 minutes

/**
 * Fetch and parse a Square checkout page for signup data
 */
async function fetchSquarePage(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!resp.ok) {
    throw new Error(`Square fetch failed: ${resp.status}`);
  }

  const html = await resp.text();

  // Extract window.bootstrap JSON
  const match = html.match(/window\.bootstrap\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!match) {
    throw new Error('Could not find window.bootstrap in Square checkout page');
  }

  const bootstrap = JSON.parse(match[1]);
  const checkoutName = bootstrap.checkoutLink?.checkout_link_data?.name || 'Open Mic';
  const venueName = bootstrap.checkoutTitle || checkoutName;

  // Build variation ID → inventory map
  const inventoryMap = {};
  for (const inv of (bootstrap.inventoryCounts || [])) {
    inventoryMap[inv.catalog_object_id] = {
      available: parseInt(inv.quantity_available || '0', 10),
      state: inv.availability_state
    };
  }

  // Extract item variations (time slots)
  const slots = [];
  const items = bootstrap.relatedObjects || [];
  for (const obj of items) {
    if (obj.type !== 'ITEM') continue;
    for (const variation of (obj.item_data?.variations || [])) {
      const varData = variation.item_variation_data;
      const varId = variation.id;
      const inv = inventoryMap[varId] || {};

      // Parse day and time from variation name (e.g. "Monday 6:30 pm - 7:45 pm")
      const nameMatch = (varData.name || '').match(/^(\w+)\s+(.+)$/);
      const day = nameMatch ? nameMatch[1] : varData.name;
      const time = nameMatch ? nameMatch[2] : '';

      const soldOut = inv.state === 'SOLD_OUT' || inv.available === 0;

      slots.push({
        day,
        time,
        spotsLeft: soldOut ? 0 : (inv.available || 0),
        soldOut,
        price: varData.price_money ? (varData.price_money.amount / 100).toFixed(2) : null
      });
    }
  }

  return {
    venueName,
    signupUrl: url,
    slots,
    lastFetched: new Date().toISOString()
  };
}

/**
 * Get Square checkout data (with caching)
 */
async function getSquareData(url) {
  const cached = cache[url];
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL) {
    return cached.data;
  }

  try {
    const data = await fetchSquarePage(url);
    cache[url] = { data, fetchedAt: Date.now() };
    console.log(`✅ Square data refreshed for ${data.venueName}: ${data.slots.length} slots`);
    return data;
  } catch (err) {
    console.error(`❌ Square fetch error:`, err.message);
    if (cached) return cached.data;
    return null;
  }
}

module.exports = { getSquareData };
