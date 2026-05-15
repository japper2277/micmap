// cors-allowlist.test.js
// Regression guard: the shipped iOS App Store binary was built from
// release-stable with capacitor.config.json server.url pointing at
// https://micmap.netlify.app. If this origin is removed from the API
// CORS allowlist, every installed copy of the iOS app silently fails
// to fetch mic data — the map renders but no markers appear.
//
// Re-add the origin instead of removing it. If you really need to drop
// it, plan a coordinated App Store resubmission first.

const fs = require('fs');
const path = require('path');

const SERVER_PATH = path.join(__dirname, '..', '..', 'server.js');
const SHIPPED_NATIVE_ORIGINS = [
  'https://micfinder.io',
  'https://www.micfinder.io',
  'https://micmap.netlify.app'
];

describe('Critical Path: CORS allowlist', () => {
  test('server.js retains every origin a shipped native build loads from', () => {
    const source = fs.readFileSync(SERVER_PATH, 'utf8');
    const match = source.match(/const ALLOWED_CORS_ORIGINS = new Set\(\[([\s\S]*?)\]\)/);
    expect(match).not.toBeNull();

    const block = match[1];
    SHIPPED_NATIVE_ORIGINS.forEach((origin) => {
      expect(block).toContain(`'${origin}'`);
    });
  });
});
