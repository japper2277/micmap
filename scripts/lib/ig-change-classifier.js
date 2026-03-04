const { normalizeDay, normalizeText, normalizeTime } = require('./ig-mic-matcher');

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function todayEtDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function buildSignUpDetailsCandidate(analysis) {
  const instructions = normalizeSpace(analysis?.signupInstructions);
  const url = normalizeSpace(analysis?.signupUrl);

  if (!instructions && !url) return null;
  if (url && instructions && !instructions.includes(url)) {
    return `${url} — ${instructions}`;
  }
  return url || instructions;
}

function makeNotesLine({ analysis, handle, source, postUrl, sourceType }) {
  const date = todayEtDate();
  const urlPart = postUrl ? ` (${postUrl})` : '';
  const spotsPart = Number.isInteger(analysis?.spotsLeft)
    ? ` spots ${analysis.spotsLeft}${Number.isInteger(analysis?.capacity) ? `/${analysis.capacity}` : ''}`
    : '';

  if (sourceType === 'fb_group') {
    return `[FB sync ${date}] group post${urlPart}${spotsPart}`;
  }

  const channel = source === 'post' ? 'post' : 'story';
  return `[IG sync ${date}] @${handle} ${channel}${urlPart}${spotsPart}`;
}

function sourceLabel(sourceType) {
  return sourceType === 'fb_group' ? 'FB group post' : 'IG content';
}

function addRiskIfDifferent(risks, field, extracted, existing, normalizer = normalizeText, sourceType) {
  const a = normalizer(extracted);
  const b = normalizer(existing);
  if (!a) return;
  if (!b || a !== b) {
    risks.push({
      field,
      from: existing || null,
      to: extracted,
      reason: `${field} differs from extracted ${sourceLabel(sourceType)}`
    });
  }
}

function classifyIgCandidate({ analysis, matchedMic, handle, source, postUrl, sourceType }) {
  const result = {
    classification: 'ignore',
    reasons: [],
    safeChanges: [],
    riskyChanges: [],
    candidateFields: {
      name: analysis?.micName || null,
      day: analysis?.day || null,
      startTime: analysis?.time || null,
      venueName: analysis?.venueName || null,
      signUpDetails: buildSignUpDetailsCandidate(analysis),
      host: analysis?.host || null,
      cost: analysis?.cost || null,
      stageTime: analysis?.stageTime || null,
      notesLine: makeNotesLine({ analysis, handle, source, postUrl, sourceType })
    }
  };

  if (!analysis?.isSignup) {
    result.reasons.push('analysis indicates non-signup content');
    return result;
  }

  if (!matchedMic) {
    result.classification = 'review_required';
    result.reasons.push('no matching mic found for extracted signup content');
    result.riskyChanges.push({
      field: 'record_match',
      from: null,
      to: 'unmatched',
      reason: 'potential new event or missing selector mapping'
    });
    return result;
  }

  const candidateSignUp = result.candidateFields.signUpDetails;
  if (candidateSignUp && normalizeText(candidateSignUp) !== normalizeText(matchedMic.signUpDetails)) {
    result.safeChanges.push({
      field: 'signUpDetails',
      from: matchedMic.signUpDetails || null,
      to: candidateSignUp
    });
  }

  // Risky fields: extracted schedule/venue/core metadata differs from current record.
  addRiskIfDifferent(result.riskyChanges, 'day', analysis?.day, matchedMic.day, normalizeDay, sourceType);
  addRiskIfDifferent(result.riskyChanges, 'startTime', analysis?.time, matchedMic.startTime, normalizeTime, sourceType);
  addRiskIfDifferent(result.riskyChanges, 'venueName', analysis?.venueName, matchedMic.venueName, normalizeText, sourceType);
  addRiskIfDifferent(result.riskyChanges, 'name', analysis?.micName, matchedMic.name, normalizeText, sourceType);
  addRiskIfDifferent(result.riskyChanges, 'host', analysis?.host, matchedMic.host, normalizeText, sourceType);
  addRiskIfDifferent(result.riskyChanges, 'cost', analysis?.cost, matchedMic.cost, normalizeText, sourceType);
  addRiskIfDifferent(result.riskyChanges, 'stageTime', analysis?.stageTime, matchedMic.stageTime, normalizeText, sourceType);

  if (result.riskyChanges.length > 0) {
    result.classification = 'review_required';
    result.reasons.push('extracted risky fields differ from current mic record');
    return result;
  }

  if (result.safeChanges.length > 0) {
    result.classification = 'safe_write';
    result.reasons.push('signup-only changes detected');
    return result;
  }

  result.classification = 'ignore';
  result.reasons.push('no effective safe changes detected');
  return result;
}

module.exports = {
  buildSignUpDetailsCandidate,
  classifyCandidate: classifyIgCandidate,
  classifyIgCandidate,
  makeNotesLine,
  todayEtDate
};
