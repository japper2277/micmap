const fs = require('fs');
const path = require('path');

function buildStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function createDiagnostics(handle, diagnosticsDir) {
  return {
    generatedAt: new Date().toISOString(),
    handle,
    diagnosticsDir,
    transitions: [],
    actions: [],
    artifacts: [],
    failureReason: null
  };
}

function recordTransition(diag, phase, state) {
  diag.transitions.push({
    at: new Date().toISOString(),
    phase,
    state: state?.state || 'unknown',
    visibleHandle: state?.visibleHandle || null,
    url: state?.snapshot?.url || null
  });
}

function recordAction(diag, action, details = {}) {
  diag.actions.push({
    at: new Date().toISOString(),
    action,
    ...details
  });
}

async function saveFailureScreenshot(page, diag, label = 'failure') {
  const filePath = path.join(
    diag.diagnosticsDir,
    `ig-story-${label}-${diag.handle}-${buildStamp()}.png`
  );
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage: true });
  diag.artifacts.push({
    type: 'failure_screenshot',
    path: filePath
  });
  return filePath;
}

function setFailureReason(diag, reason) {
  if (!diag.failureReason) {
    diag.failureReason = reason;
  }
}

function writeDiagnostics(diag) {
  const filePath = path.join(
    diag.diagnosticsDir,
    `ig-story-diagnostics-${diag.handle}-${buildStamp()}.json`
  );
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(diag, null, 2));
  return filePath;
}

module.exports = {
  createDiagnostics,
  recordAction,
  recordTransition,
  saveFailureScreenshot,
  setFailureReason,
  writeDiagnostics
};
