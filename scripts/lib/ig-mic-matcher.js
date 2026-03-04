const REQUIRED_SELECTOR_FIELDS = ['name', 'day', 'startTime', 'venueName'];

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
  return normalizeSpace(value)
    .toLowerCase()
    .replace(/[^a-z0-9@\s]/g, '')
    .trim();
}

function normalizeDay(value) {
  const clean = normalizeText(value);
  if (!clean) return null;
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const day = days.find((d) => clean.startsWith(d));
  return day || null;
}

function normalizeTime(value) {
  const raw = normalizeSpace(value).toUpperCase().replace(/\./g, '');
  if (!raw) return null;

  const explicit = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/);
  if (explicit) {
    const hour = Number(explicit[1]);
    const minute = Number(explicit[2] || '00');
    const ampm = explicit[3];
    const displayMinute = String(minute).padStart(2, '0');
    return `${hour}:${displayMinute} ${ampm}`;
  }

  return normalizeSpace(value);
}

function matchesSelector(mic, selector) {
  const micDay = normalizeDay(mic.day);
  const selectorDay = normalizeDay(selector.day);
  const micTime = normalizeTime(mic.startTime);
  const selectorTime = normalizeTime(selector.startTime);

  return normalizeText(mic.name) === normalizeText(selector.name)
    && micDay === selectorDay
    && micTime === selectorTime
    && normalizeText(mic.venueName) === normalizeText(selector.venueName);
}

function selectorIsComplete(selector) {
  if (!selector || typeof selector !== 'object') return false;
  return REQUIRED_SELECTOR_FIELDS.every((field) => normalizeSpace(selector[field]).length > 0);
}

function handleInHost(host, handle) {
  const cleanHost = normalizeText(host).replace(/^@/, '');
  const cleanHandle = normalizeText(handle).replace(/^@/, '');
  if (!cleanHost || !cleanHandle) return false;
  return cleanHost.includes(cleanHandle);
}

function findByHostAndVenue(mics, handle, venueName) {
  const normalizedVenue = normalizeText(venueName);
  if (!handle || !normalizedVenue) return null;

  for (let index = 0; index < mics.length; index += 1) {
    const mic = mics[index];
    if (normalizeText(mic.venueName) !== normalizedVenue) continue;
    if (!handleInHost(mic.host, handle)) continue;
    return { mic, index, method: 'host_venue_fallback' };
  }

  return null;
}

function matchMicFromWatchlist(mics, watchEntry, analysis) {
  const selectors = Array.isArray(watchEntry?.micSelectors) ? watchEntry.micSelectors : [];

  // 1) Deterministic selector match (required fields only)
  for (const selector of selectors) {
    if (!selectorIsComplete(selector)) continue;
    for (let index = 0; index < mics.length; index += 1) {
      const mic = mics[index];
      if (matchesSelector(mic, selector)) {
        return {
          mic,
          index,
          method: 'selector_exact',
          selector
        };
      }
    }
  }

  // 2) Analysis-based exact match when extracted fields are complete
  const extractedSelector = {
    name: analysis?.micName,
    day: analysis?.day,
    startTime: analysis?.time,
    venueName: analysis?.venueName
  };

  if (selectorIsComplete(extractedSelector)) {
    for (let index = 0; index < mics.length; index += 1) {
      const mic = mics[index];
      if (matchesSelector(mic, extractedSelector)) {
        return {
          mic,
          index,
          method: 'analysis_exact',
          selector: extractedSelector
        };
      }
    }
  }

  // 3) Fallback by host+venue
  const fallbackVenue = analysis?.venueName || selectors[0]?.venueName || null;
  const fallbackHandle = watchEntry?.handle || selectors[0]?.host || null;
  const fallback = findByHostAndVenue(mics, fallbackHandle, fallbackVenue);
  if (fallback) {
    return {
      mic: fallback.mic,
      index: fallback.index,
      method: fallback.method,
      selector: {
        host: fallbackHandle,
        venueName: fallbackVenue
      }
    };
  }

  return null;
}

module.exports = {
  matchMicFromWatchlist,
  normalizeDay,
  normalizeText,
  normalizeTime,
  selectorIsComplete
};
