#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const MICS_PATH = path.join(__dirname, '../api/mics.json');
const DEFAULT_REPORT_PATH = path.join(__dirname, '../logs/ig-stories-report.json');
const DEFAULT_SUMMARY_PATH = path.join(__dirname, '../logs/ig-apply-summary.json');
const FLYERS_DIR = path.join(__dirname, '../api/public/data/flyers');
const FLYER_BASE_URL = 'https://micmap-production.up.railway.app/data/flyers';
const SAFE_CONFIDENCE_THRESHOLD = 0.85;

function parseArgs(argv) {
  const out = {
    reportPath: DEFAULT_REPORT_PATH,
    summaryPath: DEFAULT_SUMMARY_PATH,
    dryRun: false,
    write: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--report' && argv[i + 1]) out.reportPath = path.resolve(argv[++i]);
    else if (arg === '--summary' && argv[i + 1]) out.summaryPath = path.resolve(argv[++i]);
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--write') out.write = true;
  }

  return out;
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveMicIndex(mics, matchedMicRef) {
  if (!matchedMicRef) return -1;

  const index = Number.isInteger(matchedMicRef.index) ? matchedMicRef.index : -1;
  if (index >= 0 && index < mics.length) {
    const mic = mics[index];
    if (
      mic.name === matchedMicRef.name
      && mic.day === matchedMicRef.day
      && mic.startTime === matchedMicRef.startTime
      && mic.venueName === matchedMicRef.venueName
    ) {
      return index;
    }
  }

  return mics.findIndex((mic) => (
    mic.name === matchedMicRef.name
    && mic.day === matchedMicRef.day
    && mic.startTime === matchedMicRef.startTime
    && mic.venueName === matchedMicRef.venueName
  ));
}

function appendNoteIdempotent(existingNotes, noteLine) {
  const cleanLine = normalizeSpace(noteLine);
  if (!cleanLine) return existingNotes;

  const current = String(existingNotes || '').trim();
  if (current.includes(cleanLine)) return existingNotes;
  if (!current) return cleanLine;
  return `${current}\n${cleanLine}`;
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function copyFlyer(entry, mic, dryRun) {
  const src = entry.screenshotPath;
  if (!src) return null;

  try {
    fs.accessSync(src, fs.constants.R_OK);
  } catch {
    return null;
  }

  const filename = `${slugify(mic.day)}-${slugify(mic.startTime)}-${slugify(mic.venueName)}.png`;
  const dest = path.join(FLYERS_DIR, filename);

  if (!dryRun) {
    fs.mkdirSync(FLYERS_DIR, { recursive: true });
    fs.copyFileSync(src, dest);
  }

  return `${FLYER_BASE_URL}/${filename}`;
}

async function applyFlyerOnly(mic, entry, dryRun) {
  const changes = [];
  const flyerUrl = await copyFlyer(entry, mic, dryRun);
  if (flyerUrl && flyerUrl !== mic.flyerUrl) {
    changes.push({ field: 'flyerUrl', from: mic.flyerUrl || null, to: flyerUrl });
    mic.flyerUrl = flyerUrl;
    const dateStr = new Date().toISOString().slice(0, 10);
    mic.flyerDate = dateStr;
    changes.push({ field: 'flyerDate', from: null, to: dateStr });
  }
  return changes;
}

async function applyEntryToMic(mic, entry, dryRun) {
  const changes = [];

  const nextSignUp = normalizeSpace(entry.candidateFields?.signUpDetails);
  if (nextSignUp && nextSignUp !== normalizeSpace(mic.signUpDetails)) {
    changes.push({
      field: 'signUpDetails',
      from: mic.signUpDetails || null,
      to: nextSignUp
    });
    mic.signUpDetails = nextSignUp;
  }

  const noteLine = entry.candidateFields?.notesLine;
  if (noteLine) {
    const nextNotes = appendNoteIdempotent(mic.notes, noteLine);
    if (nextNotes !== mic.notes) {
      changes.push({
        field: 'notes',
        from: mic.notes || null,
        to: nextNotes
      });
      mic.notes = nextNotes;
    }
  }

  const flyerUrl = await copyFlyer(entry, mic, dryRun);
  if (flyerUrl && flyerUrl !== mic.flyerUrl) {
    changes.push({
      field: 'flyerUrl',
      from: mic.flyerUrl || null,
      to: flyerUrl
    });
    mic.flyerUrl = flyerUrl;
    const dateStr = new Date().toISOString().slice(0, 10);
    mic.flyerDate = dateStr;
    changes.push({ field: 'flyerDate', from: null, to: dateStr });
  }

  return changes;
}

async function main() {
  const args = parseArgs(process.argv);
  const report = loadJson(args.reportPath);
  const mics = loadJson(MICS_PATH);

  const entries = Array.isArray(report.entries) ? report.entries : [];
  const summary = {
    generatedAt: new Date().toISOString(),
    reportPath: args.reportPath,
    dryRun: args.dryRun,
    write: args.write,
    threshold: SAFE_CONFIDENCE_THRESHOLD,
    scanned: entries.length,
    eligible: 0,
    applied: 0,
    skipped: 0,
    skippedReasons: {
      non_safe_classification: 0,
      low_confidence: 0,
      no_match: 0,
      no_effective_change: 0
    },
    updates: []
  };

  for (const entry of entries) {
    const isSafeWrite = entry.classification === 'safe_write';
    const isReviewWithMatch = entry.classification === 'review_required' && entry.matchedMicRef;

    if (!isSafeWrite && !isReviewWithMatch) {
      summary.skipped += 1;
      summary.skippedReasons.non_safe_classification += 1;
      continue;
    }

    if (isSafeWrite && Number(entry.confidence || 0) < SAFE_CONFIDENCE_THRESHOLD) {
      summary.skipped += 1;
      summary.skippedReasons.low_confidence += 1;
      continue;
    }

    const micIndex = resolveMicIndex(mics, entry.matchedMicRef);
    if (micIndex < 0) {
      summary.skipped += 1;
      summary.skippedReasons.no_match += 1;
      continue;
    }

    summary.eligible += 1;
    const mic = mics[micIndex];
    const before = {
      signUpDetails: mic.signUpDetails || null,
      notes: mic.notes || null
    };

    // For review_required, only copy the flyer (skip field changes)
    const entryChanges = isReviewWithMatch && !isSafeWrite
      ? await applyFlyerOnly(mic, entry, args.dryRun || !args.write)
      : await applyEntryToMic(mic, entry, args.dryRun || !args.write);
    if (entryChanges.length === 0) {
      summary.skipped += 1;
      summary.skippedReasons.no_effective_change += 1;
      continue;
    }

    summary.applied += 1;
    summary.updates.push({
      handle: entry.handle,
      source: entry.source,
      postUrl: entry.postUrl || null,
      confidence: entry.confidence,
      micRef: {
        name: mic.name,
        day: mic.day,
        startTime: mic.startTime,
        venueName: mic.venueName,
        index: micIndex
      },
      before,
      changes: entryChanges
    });
  }

  if (!args.dryRun && args.write && summary.applied > 0) {
    fs.writeFileSync(MICS_PATH, JSON.stringify(mics, null, 2));
    console.log(`Applied ${summary.applied} safe update(s) to ${MICS_PATH}`);
  } else {
    console.log(`Dry run / no-write mode: ${summary.applied} safe update(s) identified`);
  }

  fs.mkdirSync(path.dirname(args.summaryPath), { recursive: true });
  fs.writeFileSync(args.summaryPath, JSON.stringify(summary, null, 2));
  console.log(`Apply summary written: ${args.summaryPath}`);

  if (summary.updates.length > 0) {
    console.log('Updates:');
    summary.updates.forEach((u, idx) => {
      console.log(` ${idx + 1}. ${u.micRef.day} ${u.micRef.startTime} ${u.micRef.name} (${u.changes.map((c) => c.field).join(', ')})`);
    });
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  appendNoteIdempotent,
  applyEntryToMic,
  copyFlyer,
  parseArgs,
  resolveMicIndex,
  slugify
};
