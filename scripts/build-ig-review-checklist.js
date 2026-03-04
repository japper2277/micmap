#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const DEFAULT_REPORT_PATH = path.join(__dirname, '../logs/ig-stories-report.json');
const DEFAULT_APPLY_SUMMARY_PATH = path.join(__dirname, '../logs/ig-apply-summary.json');
const DEFAULT_REVIEW_JSON_PATH = path.join(__dirname, '../logs/ig-review.json');
const DEFAULT_REVIEW_MD_PATH = path.join(__dirname, '../logs/ig-review.md');

function parseArgs(argv) {
  const out = {
    reportPath: DEFAULT_REPORT_PATH,
    applySummaryPath: DEFAULT_APPLY_SUMMARY_PATH,
    reviewJsonPath: DEFAULT_REVIEW_JSON_PATH,
    reviewMdPath: DEFAULT_REVIEW_MD_PATH
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--report' && argv[i + 1]) out.reportPath = path.resolve(argv[++i]);
    else if (arg === '--apply-summary' && argv[i + 1]) out.applySummaryPath = path.resolve(argv[++i]);
    else if (arg === '--review-json' && argv[i + 1]) out.reviewJsonPath = path.resolve(argv[++i]);
    else if (arg === '--review-md' && argv[i + 1]) out.reviewMdPath = path.resolve(argv[++i]);
  }

  return out;
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatRisk(risk) {
  const from = risk.from === null || risk.from === undefined ? 'null' : String(risk.from);
  const to = risk.to === null || risk.to === undefined ? 'null' : String(risk.to);
  return `- ${risk.field}: \`${from}\` -> \`${to}\``;
}

function buildMarkdown(review, reportPath, applySummaryPath) {
  const lines = [];
  lines.push('# IG Stories Review Checklist');
  lines.push('');
  lines.push(`Report: \`${reportPath}\``);
  lines.push(`Apply summary: \`${applySummaryPath}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Auto-applied safe writes: ${review.counts.autoAppliedSafeWrites}`);
  lines.push(`- Review-required updates: ${review.counts.reviewRequired}`);
  lines.push(`- Unmatched/new candidates: ${review.counts.unmatchedCandidates}`);
  lines.push('');

  lines.push('## Auto-applied Safe Writes');
  if (review.autoAppliedSafeWrites.length === 0) {
    lines.push('- None');
  } else {
    review.autoAppliedSafeWrites.forEach((item, idx) => {
      lines.push(`- ${idx + 1}. ${item.micRef.day} ${item.micRef.startTime} ${item.micRef.name} @ ${item.micRef.venueName}`);
      lines.push(`  Fields: ${item.changes.map((c) => c.field).join(', ')}`);
    });
  }
  lines.push('');

  lines.push('## Review-Required Updates');
  if (review.reviewRequired.length === 0) {
    lines.push('- None');
  } else {
    review.reviewRequired.forEach((item, idx) => {
      const mic = item.matchedMicRef
        ? `${item.matchedMicRef.day} ${item.matchedMicRef.startTime} ${item.matchedMicRef.name} @ ${item.matchedMicRef.venueName}`
        : 'Unmatched record';

      lines.push(`### ${idx + 1}. @${item.handle} (${item.source})`);
      lines.push(`- [ ] Approve`);
      lines.push(`- [ ] Reject`);
      lines.push(`- Confidence: ${item.confidence}`);
      lines.push(`- Matched mic: ${mic}`);
      if (item.postUrl) lines.push(`- Post URL: ${item.postUrl}`);
      if (item.screenshotPath) lines.push(`- Screenshot: \`${item.screenshotPath}\``);
      lines.push(`- Reasons: ${item.reasons.join('; ') || 'n/a'}`);
      if (item.riskyChanges.length > 0) {
        lines.push('- Risky diffs:');
        item.riskyChanges.forEach((risk) => lines.push(`  ${formatRisk(risk)}`));
      }
      lines.push('');
    });
  }

  lines.push('## Unmatched / New Candidate Events');
  if (review.unmatchedCandidates.length === 0) {
    lines.push('- None');
  } else {
    review.unmatchedCandidates.forEach((item, idx) => {
      lines.push(`- ${idx + 1}. @${item.handle} ${normalizeSpace(item.analysis?.micName) || '(no mic name)'} ${normalizeSpace(item.analysis?.day) || ''} ${normalizeSpace(item.analysis?.time) || ''}`.trim());
      if (item.postUrl) lines.push(`  URL: ${item.postUrl}`);
      if (item.analysis?.signupUrl) lines.push(`  Signup: ${item.analysis.signupUrl}`);
    });
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv);
  const report = readJsonIfExists(args.reportPath, { entries: [] });
  const applySummary = readJsonIfExists(args.applySummaryPath, { updates: [] });

  const entries = Array.isArray(report.entries) ? report.entries : [];
  const reviewRequired = entries
    .filter((entry) => entry.classification === 'review_required')
    .map((entry) => ({
      handle: entry.handle,
      source: entry.source,
      confidence: entry.confidence,
      postUrl: entry.postUrl || null,
      screenshotPath: entry.screenshotPath || null,
      analysis: entry.analysis || {},
      matchedMicRef: entry.matchedMicRef || null,
      riskyChanges: Array.isArray(entry.riskyChanges) ? entry.riskyChanges : [],
      reasons: Array.isArray(entry.reasons) ? entry.reasons : []
    }));

  const unmatchedCandidates = reviewRequired.filter((entry) => !entry.matchedMicRef);
  const autoAppliedSafeWrites = Array.isArray(applySummary.updates) ? applySummary.updates : [];

  const review = {
    autoAppliedSafeWrites,
    reviewRequired,
    unmatchedCandidates,
    counts: {
      autoAppliedSafeWrites: autoAppliedSafeWrites.length,
      reviewRequired: reviewRequired.length,
      unmatchedCandidates: unmatchedCandidates.length
    }
  };

  const md = buildMarkdown(review, args.reportPath, args.applySummaryPath);

  fs.mkdirSync(path.dirname(args.reviewJsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(args.reviewMdPath), { recursive: true });
  fs.writeFileSync(args.reviewJsonPath, JSON.stringify(review, null, 2));
  fs.writeFileSync(args.reviewMdPath, md);

  console.log(`Review JSON written: ${args.reviewJsonPath}`);
  console.log(`Review markdown written: ${args.reviewMdPath}`);
  console.log(`Review-required: ${review.counts.reviewRequired}, unmatched: ${review.counts.unmatchedCandidates}`);
}

main();
