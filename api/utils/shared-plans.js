const crypto = require('crypto');

const PLAN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_APP_BASE_URL = 'https://micfinder.io/';
const DEFAULT_API_BASE_URL = 'https://micmap-production.up.railway.app';
const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const APP_ALLOWED_HOSTS = new Set(['micfinder.io', 'www.micfinder.io']);
const API_ALLOWED_HOSTS = new Set(['micmap-production.up.railway.app']);
const MIC_SNAPSHOT_STRING_LIMITS = {
  id: 120,
  name: 160,
  title: 160,
  venueName: 160,
  venue: 160,
  borough: 80,
  neighborhood: 120,
  hood: 120,
  address: 240,
  day: 40,
  startTime: 40,
  endTime: 40,
  time: 40,
  timeStr: 40,
  cost: 40,
  price: 40,
  setTime: 40,
  stageTime: 40,
  signupInstructions: 500,
  signUpDetails: 500,
  host: 120,
  notes: 800
};
const MIC_SNAPSHOT_ALLOWED_KEYS = new Set([
  ...Object.keys(MIC_SNAPSHOT_STRING_LIMITS),
  'lat',
  'lng',
  'lon'
]);

function isAllowedHost(parsed, allowedHosts, allowLocal = true) {
  return allowedHosts.has(parsed.hostname) || (allowLocal && LOCAL_HOSTS.has(parsed.hostname));
}

function normalizeBaseUrlString(parsed, trailingSlash) {
  return trailingSlash
    ? parsed.toString().replace(/\/?$/, '/')
    : parsed.toString().replace(/\/$/, '');
}

function validateAllowedBaseUrl(value, {
  fallback = '',
  allowedHosts = new Set(),
  allowEmpty = true,
  allowLocal = true,
  trailingSlash = false,
  label = 'url'
} = {}) {
  const raw = String(value || '').trim();
  if (!raw) {
    return allowEmpty
      ? { value: fallback, error: null }
      : { value: fallback, error: `${label} is required` };
  }

  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { value: fallback, error: `${label} must use http or https` };
    }
    if (!isAllowedHost(parsed, allowedHosts, allowLocal)) {
      return { value: fallback, error: `${label} host is not allowed` };
    }
    return { value: normalizeBaseUrlString(parsed, trailingSlash), error: null };
  } catch (_) {
    return { value: fallback, error: `${label} is invalid` };
  }
}

function validateShareId(value) {
  return SHARE_ID_PATTERN.test(String(value || '').trim());
}

function validateTextField(value, {
  field,
  maxLength,
  allowEmpty = true
}) {
  if (value === undefined || value === null || value === '') {
    return allowEmpty ? null : `${field} is required`;
  }

  if (typeof value !== 'string') {
    return `${field} must be a string`;
  }

  if (value.length > maxLength) {
    return `${field} must be ${maxLength} characters or fewer`;
  }

  const disallowedControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
  if (disallowedControls.test(value)) {
    return `${field} contains unsupported control characters`;
  }

  return null;
}

function sanitizeMicSnapshot(snapshot) {
  if (snapshot === undefined || snapshot === null) {
    return { value: null, error: null };
  }

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { value: null, error: 'micSnapshot must be an object' };
  }

  const unexpectedKeys = Object.keys(snapshot).filter((key) => !MIC_SNAPSHOT_ALLOWED_KEYS.has(key));
  if (unexpectedKeys.length > 0) {
    return { value: null, error: `micSnapshot has unsupported field(s): ${unexpectedKeys.join(', ')}` };
  }

  const next = {};
  for (const [field, maxLength] of Object.entries(MIC_SNAPSHOT_STRING_LIMITS)) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, field) || snapshot[field] === null || snapshot[field] === undefined) {
      continue;
    }

    if (typeof snapshot[field] !== 'string' && typeof snapshot[field] !== 'number') {
      return { value: null, error: `micSnapshot.${field} must be a string` };
    }

    const raw = String(snapshot[field]);
    const validationError = validateTextField(raw, { field: `micSnapshot.${field}`, maxLength });
    if (validationError) {
      return { value: null, error: validationError };
    }

    next[field] = raw.trim();
  }

  for (const field of ['lat', 'lng', 'lon']) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, field) || snapshot[field] === null || snapshot[field] === undefined || snapshot[field] === '') {
      continue;
    }

    const numericValue = Number(snapshot[field]);
    if (!Number.isFinite(numericValue)) {
      return { value: null, error: `micSnapshot.${field} must be a finite number` };
    }
    next[field] = numericValue;
  }

  if (next.lat !== undefined && next.lng === undefined && next.lon === undefined) {
    return { value: null, error: 'micSnapshot must include lng or lon when lat is provided' };
  }

  if (next.lng !== undefined && next.lon === undefined) next.lon = next.lng;
  if (next.lon !== undefined && next.lng === undefined) next.lng = next.lon;

  return { value: next, error: null };
}

function normalizeParticipantName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function cleanDisplayName(name, fallback = 'Someone') {
  const cleaned = String(name || '').trim().replace(/\s+/g, ' ');
  return cleaned || fallback;
}

function buildExpiryDate(now = new Date()) {
  return new Date(now.getTime() + PLAN_LIFETIME_MS);
}

function generateShareId() {
  return crypto.randomBytes(6).toString('base64url');
}

function createActivityEntry({
  type,
  actorName,
  message,
  micId = null,
  suggestionId = null,
  meta = null
}) {
  return {
    type,
    actorName: cleanDisplayName(actorName),
    message,
    micId,
    suggestionId,
    meta,
    createdAt: new Date()
  };
}

function sanitizeAppBaseUrl(value, fallback = DEFAULT_APP_BASE_URL) {
  const result = validateAllowedBaseUrl(value, {
    fallback,
    allowedHosts: APP_ALLOWED_HOSTS,
    trailingSlash: true,
    label: 'appBaseUrl'
  });
  return result.error ? fallback : result.value;
}

function sanitizeApiBaseUrl(value, fallback = '') {
  const result = validateAllowedBaseUrl(value, {
    fallback,
    allowedHosts: API_ALLOWED_HOSTS,
    trailingSlash: false,
    label: 'apiBaseUrl'
  });
  return result.error ? fallback : result.value;
}

function validateAppBaseUrl(value, fallback = DEFAULT_APP_BASE_URL) {
  return validateAllowedBaseUrl(value, {
    fallback,
    allowedHosts: APP_ALLOWED_HOSTS,
    trailingSlash: true,
    label: 'appBaseUrl'
  });
}

function validateApiBaseUrl(value, fallback = DEFAULT_API_BASE_URL) {
  return validateAllowedBaseUrl(value, {
    fallback,
    allowedHosts: API_ALLOWED_HOSTS,
    trailingSlash: false,
    label: 'apiBaseUrl'
  });
}

function applySharedPlanUrlOverrides(url, { apiBaseUrl = '', appBaseUrl = '' } = {}) {
  const nextUrl = new URL(url.toString());
  const safeApiBaseUrl = sanitizeApiBaseUrl(apiBaseUrl);
  const safeAppBaseUrl = sanitizeAppBaseUrl(appBaseUrl);

  if (safeApiBaseUrl) nextUrl.searchParams.set('apiBase', safeApiBaseUrl);
  if (safeAppBaseUrl && safeAppBaseUrl !== DEFAULT_APP_BASE_URL) nextUrl.searchParams.set('appBase', safeAppBaseUrl);

  return nextUrl.toString();
}

function buildSharedPlanUrls(shareId, appBaseUrl = DEFAULT_APP_BASE_URL, apiBaseUrl = '') {
  const base = sanitizeAppBaseUrl(appBaseUrl);
  const encodedShareId = encodeURIComponent(shareId);
  const safeApiBaseUrl = sanitizeApiBaseUrl(apiBaseUrl);
  const shareUrl = applySharedPlanUrlOverrides(new URL(`share/?shared=${encodedShareId}`, base), {
    apiBaseUrl: safeApiBaseUrl,
    appBaseUrl: base
  });
  const mapUrl = applySharedPlanUrlOverrides(new URL(`?shared=${encodedShareId}`, base), {
    apiBaseUrl: safeApiBaseUrl,
    appBaseUrl: base
  });

  return {
    appBaseUrl: base,
    apiBaseUrl: safeApiBaseUrl,
    shareUrl,
    mapUrl
  };
}

function timeStringToMinutes(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return Number.POSITIVE_INFINITY;

  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2] || '0', 10);
  const meridiem = match[3].toUpperCase();

  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;

  return hours * 60 + mins;
}

function serializeMicForSharedPlan(micDoc) {
  if (!micDoc) return null;

  const mic = micDoc.toObject ? micDoc.toObject({ virtuals: true }) : micDoc;
  const id = String(mic._id || mic.id || mic.micId || '');
  const venueName = mic.venueName || mic.venue || mic.title || mic.name || 'Mic';

  return {
    id,
    name: mic.name || venueName,
    title: venueName,
    venueName,
    venue: venueName,
    borough: mic.borough || '',
    neighborhood: mic.neighborhood || '',
    hood: mic.neighborhood || '',
    address: mic.address || '',
    lat: mic.lat,
    lng: mic.lng ?? mic.lon,
    lon: mic.lon ?? mic.lng,
    day: mic.day || '',
    startTime: mic.startTime || '',
    endTime: mic.endTime || '',
    time: mic.startTime || '',
    timeStr: mic.startTime || '',
    cost: mic.cost || 'Free',
    price: mic.cost || 'Free',
    setTime: mic.stageTime || '',
    signupInstructions: mic.signUpDetails || '',
    host: mic.host || '',
    notes: mic.notes || ''
  };
}

function normalizeStops(stops, micDocsById = new Map()) {
  return [...(stops || [])]
    .map((stop, index) => ({
      micId: String(stop.micId),
      stayMins: Number.isFinite(Number(stop.stayMins)) ? Number(stop.stayMins) : 45,
      order: Number.isFinite(Number(stop.order)) ? Number(stop.order) : index,
      addedBy: cleanDisplayName(stop.addedBy || 'planner'),
      micSnapshot: stop.micSnapshot || null,
      addedAt: stop.addedAt ? new Date(stop.addedAt) : new Date()
    }))
    .sort((a, b) => {
      const micA = micDocsById.get(a.micId);
      const micB = micDocsById.get(b.micId);
      const timeDiff = timeStringToMinutes(micA?.startTime) - timeStringToMinutes(micB?.startTime);
      if (Number.isFinite(timeDiff) && timeDiff !== 0) return timeDiff;
      return a.order - b.order;
    })
    .map((stop, index) => ({ ...stop, order: index }));
}

function computeMeetupRecommendation(plan, micDocsById = new Map()) {
  const stops = [...(plan?.stops || [])].sort((a, b) => a.order - b.order);
  if (stops.length === 0) return null;

  const byMicId = new Map(
    stops.map((stop, index) => [
      stop.micId,
      {
        stop,
        order: index,
        score: 0,
        counts: { in: 0, maybe: 0, meet_later: 0 }
      }
    ])
  );

  for (const response of plan.responses || []) {
    const entry = byMicId.get(response.targetMicId);
    if (!entry) continue;

    if (response.response === 'in') {
      entry.score += 1;
      entry.counts.in += 1;
    } else if (response.response === 'maybe') {
      entry.score += 0.5;
      entry.counts.maybe += 1;
    } else if (response.response === 'meet_later') {
      entry.score += 1;
      entry.counts.meet_later += 1;
    }
  }

  let chosen = null;
  if (plan.meetupStopId && byMicId.has(plan.meetupStopId)) {
    chosen = byMicId.get(plan.meetupStopId);
  } else {
    chosen = [...byMicId.values()].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.order - b.order;
    })[0];
  }

  if (!chosen) return null;

  const mic = micDocsById.get(chosen.stop.micId) || chosen.stop.micSnapshot || null;
  const totalResponses = chosen.counts.in + chosen.counts.maybe + chosen.counts.meet_later;
  let reason;

  if (plan.meetupStopId && plan.meetupStopId === chosen.stop.micId) {
    reason = 'The group picked this stop as the meetup point.';
  } else if (totalResponses === 0) {
    reason = 'No one has responded yet, so the earliest stop is the default meetup point.';
  } else {
    const parts = [];
    if (chosen.counts.in) parts.push(`${chosen.counts.in} in`);
    if (chosen.counts.maybe) parts.push(`${chosen.counts.maybe} maybe`);
    if (chosen.counts.meet_later) parts.push(`${chosen.counts.meet_later} meet later`);
    reason = `${parts.join(', ')} overlap here, so this is the strongest meetup point right now.`;
  }

  return {
    micId: chosen.stop.micId,
    order: chosen.order,
    score: chosen.score,
    counts: chosen.counts,
    source: plan.meetupStopId && plan.meetupStopId === chosen.stop.micId ? 'manual' : 'computed',
    reason,
    venueName: mic?.venueName || mic?.venue || mic?.title || null,
    timeLabel: mic?.startTime || null
  };
}

function serializeSharedPlan(planDoc, micDocsById = new Map()) {
  const plan = planDoc.toObject ? planDoc.toObject({ virtuals: true }) : planDoc;
  const sortedStops = [...(plan.stops || [])].sort((a, b) => a.order - b.order);
  const meetupRecommendation = computeMeetupRecommendation(plan, micDocsById);
  const urls = buildSharedPlanUrls(plan.shareId, plan.appBaseUrl, plan.apiBaseUrl);

  return {
    shareId: plan.shareId,
    plannerName: plan.plannerName,
    plannerNote: plan.plannerNote || '',
    appBaseUrl: urls.appBaseUrl,
    apiBaseUrl: urls.apiBaseUrl,
    status: plan.status,
    revision: plan.revision,
    meetupStopId: plan.meetupStopId || null,
    stops: sortedStops.map((stop) => ({
      micId: stop.micId,
      stayMins: stop.stayMins,
      order: stop.order,
      addedBy: stop.addedBy || 'planner',
      addedAt: stop.addedAt,
      mic: serializeMicForSharedPlan(micDocsById.get(stop.micId) || stop.micSnapshot)
    })),
    responses: (plan.responses || []).map((response) => ({
      name: response.name,
      response: response.response,
      targetMicId: response.targetMicId,
      updatedAt: response.updatedAt
    })),
    suggestions: (plan.suggestions || [])
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((suggestion) => ({
        id: String(suggestion._id),
        type: suggestion.type,
        status: suggestion.status,
        authorName: suggestion.authorName,
        proposedMicId: suggestion.proposedMicId || null,
        targetMicId: suggestion.targetMicId || null,
        note: suggestion.note || '',
        createdAt: suggestion.createdAt,
        updatedAt: suggestion.updatedAt,
        appliedBy: suggestion.appliedBy || null,
        appliedAt: suggestion.appliedAt || null,
        dismissedBy: suggestion.dismissedBy || null,
        dismissedAt: suggestion.dismissedAt || null,
        proposedMic: serializeMicForSharedPlan(micDocsById.get(suggestion.proposedMicId) || suggestion.proposedMicSnapshot),
        targetMic: serializeMicForSharedPlan(micDocsById.get(suggestion.targetMicId))
      })),
    activity: (plan.activity || [])
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20)
      .map((entry) => ({
        type: entry.type,
        actorName: entry.actorName,
        message: entry.message,
        micId: entry.micId || null,
        suggestionId: entry.suggestionId || null,
        meta: entry.meta || null,
        createdAt: entry.createdAt
      })),
    meetupRecommendation,
    shareUrl: urls.shareUrl,
    mapUrl: urls.mapUrl,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    expiresAt: plan.expiresAt
  };
}

module.exports = {
  PLAN_LIFETIME_MS,
  DEFAULT_API_BASE_URL,
  buildExpiryDate,
  cleanDisplayName,
  computeMeetupRecommendation,
  createActivityEntry,
  buildSharedPlanUrls,
  generateShareId,
  normalizeParticipantName,
  normalizeStops,
  sanitizeMicSnapshot,
  sanitizeApiBaseUrl,
  sanitizeAppBaseUrl,
  serializeMicForSharedPlan,
  serializeSharedPlan,
  timeStringToMinutes,
  validateApiBaseUrl,
  validateAppBaseUrl,
  validateShareId,
  validateTextField
};
