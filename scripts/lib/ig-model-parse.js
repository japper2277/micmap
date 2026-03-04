function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function coerceInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function normalizeAnalysis(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};

  return {
    isSignup: Boolean(base.isSignup),
    micName: normalizeSpace(base.micName) || null,
    day: normalizeSpace(base.day) || null,
    date: normalizeSpace(base.date) || null,
    time: normalizeSpace(base.time) || null,
    venueName: normalizeSpace(base.venueName) || null,
    signupInstructions: normalizeSpace(base.signupInstructions) || null,
    signupUrl: normalizeSpace(base.signupUrl) || null,
    spotsLeft: coerceInteger(base.spotsLeft),
    capacity: coerceInteger(base.capacity),
    host: normalizeSpace(base.host) || null,
    cost: normalizeSpace(base.cost) || null,
    stageTime: normalizeSpace(base.stageTime) || null,
    notes: normalizeSpace(base.notes) || null
  };
}

function estimateConfidence(analysis) {
  if (!analysis || !analysis.isSignup) return 0;

  let score = 0.4;
  if (analysis.micName) score += 0.1;
  if (analysis.day) score += 0.07;
  if (analysis.time) score += 0.08;
  if (analysis.venueName) score += 0.08;
  if (analysis.signupUrl) score += 0.15;
  if (analysis.signupInstructions) score += 0.08;
  if (analysis.host) score += 0.03;
  if (analysis.cost) score += 0.02;
  if (analysis.stageTime) score += 0.02;
  if (Number.isInteger(analysis.spotsLeft)) score += 0.03;

  return Math.min(0.99, Number(score.toFixed(2)));
}

function extractJsonFromModelText(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // try fallback
    }
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  return null;
}

module.exports = {
  estimateConfidence,
  extractJsonFromModelText,
  normalizeAnalysis,
  normalizeSpace
};
