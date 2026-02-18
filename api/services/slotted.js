// services/slotted.js - Scrape signup slot availability from Slotted.co
const { redis, isRedisConnected } = require('../config/cache');

const SLOTTED_CONFIGS = [
  { id: 'seshopenmics', url: 'https://slotted.co/seshopenmics', venueName: 'Sesh Comedy' }
];

const CACHE_PREFIX = 'micmap:slotted:';
const CACHE_TTL = 20 * 60; // 20 minutes
const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

async function fetchSlottedPage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Slotted fetch failed: ${res.status}`);
  return res.text();
}

function parseSlottedHtml(html) {
  // Extract the data-react-props JSON from the SignupSheet component
  const match = html.match(/data-react-class="SignupSheet"\s+data-react-props="([^"]*)"/);
  if (!match) throw new Error('Could not find SignupSheet data in HTML');

  const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const data = JSON.parse(decoded);
  const sheet = data.signupSheet.sheet;

  const slots = [];
  for (const event of sheet.events || []) {
    if (event.isPast) continue;

    for (const timeSlot of event.timeSlots || []) {
      for (const item of timeSlot.items || []) {
        const capacity = parseInt(item.atleast, 10) || 12;
        const signups = (item.signups || []).length;

        slots.push({
          date: timeSlot.startDateTime.split('T')[0],
          time: timeSlot.display,
          signups,
          capacity,
          spotsLeft: Math.max(0, capacity - signups),
          full: signups >= capacity
        });
      }
    }
  }

  return {
    title: sheet.title?.trim(),
    signupUrl: sheet.publicUrl,
    slots
  };
}

async function refreshSlottedCache() {
  for (const config of SLOTTED_CONFIGS) {
    try {
      const html = await fetchSlottedPage(config.url);
      const parsed = parseSlottedHtml(html);
      const result = {
        ...parsed,
        id: config.id,
        venueName: config.venueName,
        lastFetched: new Date().toISOString()
      };

      if (isRedisConnected()) {
        await redis.set(CACHE_PREFIX + config.id, JSON.stringify(result), 'EX', CACHE_TTL);
      }

      console.log(`✅ Slotted cache refreshed: ${config.id} (${parsed.slots.length} slots)`);
    } catch (err) {
      console.warn(`⚠️ Slotted scrape failed for ${config.id}:`, err.message);
    }
  }
}

async function getSlottedData(id) {
  if (isRedisConnected()) {
    const cached = await redis.get(CACHE_PREFIX + id);
    if (cached) return JSON.parse(cached);
  }

  // Cache miss — try live fetch
  const config = SLOTTED_CONFIGS.find(c => c.id === id);
  if (!config) return null;

  const html = await fetchSlottedPage(config.url);
  const parsed = parseSlottedHtml(html);
  const result = { ...parsed, id: config.id, venueName: config.venueName, lastFetched: new Date().toISOString() };

  if (isRedisConnected()) {
    await redis.set(CACHE_PREFIX + id, JSON.stringify(result), 'EX', CACHE_TTL);
  }

  return result;
}

function startSlottedRefresh() {
  // Initial fetch
  refreshSlottedCache();
  // Refresh every 15 minutes
  setInterval(refreshSlottedCache, REFRESH_INTERVAL);
  console.log('🔄 Slotted scraper started (every 15 min)');
}

module.exports = { getSlottedData, startSlottedRefresh, SLOTTED_CONFIGS };
