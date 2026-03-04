/**
 * Context inference for IG stories pipeline.
 *
 * When Gemini returns sparse analysis (e.g. "Mic tonight!!" → isSignup: true
 * but day/time/venue all null), this module fills gaps using:
 * 1. Temporal keywords in the analysis text ("tonight", "tomorrow", etc.)
 * 2. Watchlist mic selectors for the posting account
 *
 * Rules:
 * - Only fill null fields — never overwrite Gemini extractions
 * - If account has multiple mics on the inferred day, don't guess
 * - All inferred fields are tracked for audit trail
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Detect temporal keywords in text and return the implied day of week.
 * Returns a capitalized day name (e.g. "Wednesday") or null.
 */
function detectTemporalDay(text, currentDate) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  // "tonight" or "today"
  if (/\btonight\b/.test(lower) || /\btoday\b/.test(lower)) {
    return DAY_NAMES[currentDate.getDay()];
  }

  // "tomorrow"
  if (/\btomorrow\b/.test(lower)) {
    const tomorrow = new Date(currentDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return DAY_NAMES[tomorrow.getDay()];
  }

  // "this monday", "this tuesday", etc.
  for (const dayName of DAY_NAMES) {
    const pattern = new RegExp(`\\bthis\\s+${dayName.toLowerCase()}\\b`);
    if (pattern.test(lower)) {
      return dayName;
    }
  }

  return null;
}

/**
 * Search all text fields in the analysis for temporal keywords.
 */
function inferDayFromAnalysis(analysis, currentDate) {
  const textFields = [analysis.notes, analysis.micName, analysis.signupInstructions];
  for (const text of textFields) {
    const day = detectTemporalDay(text, currentDate);
    if (day) return { day, source: 'temporal_keyword', text };
  }
  return null;
}

/**
 * Main entry point. Enriches a normalized Gemini analysis with context
 * from the watchlist entry and current date.
 *
 * @param {Object} analysis - Normalized analysis from normalizeAnalysis()
 * @param {Object} watchlistEntry - Watchlist entry for the IG account
 * @param {Date} currentDate - Current date (injectable for testing)
 * @returns {{ enrichedAnalysis: Object, inferences: Array }}
 */
function inferContext(analysis, watchlistEntry, currentDate) {
  const inferences = [];

  if (!analysis || !analysis.isSignup) {
    return { enrichedAnalysis: analysis, inferences };
  }

  const enriched = { ...analysis };
  const selectors = Array.isArray(watchlistEntry?.micSelectors) ? watchlistEntry.micSelectors : [];

  // Step 1: Infer day from temporal keywords (only if day is null)
  let inferredDay = analysis.day;

  if (!inferredDay) {
    const temporal = inferDayFromAnalysis(analysis, currentDate);
    if (temporal) {
      inferredDay = temporal.day;
      enriched.day = temporal.day;
      inferences.push({
        field: 'day',
        value: temporal.day,
        reason: `temporal keyword in "${temporal.text}" → ${temporal.day}`
      });
    }
  }

  // Step 2: If we have an inferred day, try to fill gaps from selectors
  if (inferredDay && selectors.length > 0) {
    const dayLower = inferredDay.toLowerCase();
    const matchingSelectors = selectors.filter(
      (s) => s.day && s.day.toLowerCase() === dayLower
    );

    if (matchingSelectors.length === 1) {
      const sel = matchingSelectors[0];
      const fillable = [
        { analysisField: 'time', selectorField: 'startTime' },
        { analysisField: 'venueName', selectorField: 'venueName' },
        { analysisField: 'micName', selectorField: 'name' },
        { analysisField: 'host', selectorField: 'host' }
      ];

      for (const { analysisField, selectorField } of fillable) {
        if (!enriched[analysisField] && sel[selectorField]) {
          enriched[analysisField] = sel[selectorField];
          inferences.push({
            field: analysisField,
            value: sel[selectorField],
            reason: `unique selector match for ${inferredDay}`
          });
        }
      }
    }
    // If 0 or 2+ matching selectors → ambiguous, don't fill
  }

  return { enrichedAnalysis: enriched, inferences };
}

module.exports = { inferContext, detectTemporalDay };
