const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CAPACITOR_CONFIG_PATH = path.resolve(__dirname, '../../../../capacitor.config.json');

test('iOS app loads the live MicFinder site directly', () => {
    const config = JSON.parse(fs.readFileSync(CAPACITOR_CONFIG_PATH, 'utf8'));

    assert.equal(config.server.url, 'https://micfinder.io');
    assert.ok(config.server.allowNavigation.includes('micfinder.io'));
    assert.ok(config.server.allowNavigation.includes('www.micfinder.io'));
    assert.ok(config.server.allowNavigation.includes('micmap-production.up.railway.app'));
});
