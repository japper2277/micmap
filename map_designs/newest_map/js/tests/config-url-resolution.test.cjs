const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CONFIG_PATH = path.resolve(__dirname, '../config.js');
const CONFIG_SOURCE = fs.readFileSync(CONFIG_PATH, 'utf8');

function makeLocalStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        }
    };
}

function loadConfig(url) {
    const localStorage = makeLocalStorage();
    const location = new URL(url);
    const context = vm.createContext({
        URL,
        URLSearchParams,
        console,
        localStorage,
        window: {
            location,
            localStorage
        }
    });

    vm.runInContext(CONFIG_SOURCE, context, { filename: CONFIG_PATH });
    return context;
}

test('localhost over http uses local development URLs', () => {
    const context = loadConfig('http://localhost:4173/map_designs/newest_map/index.html');

    assert.equal(vm.runInContext('isLocalMicMapHost()', context), true);
    assert.equal(vm.runInContext('resolveApiBase()', context), 'http://127.0.0.1:3001');
    assert.equal(
        vm.runInContext('resolveAppBaseUrl()', context),
        'http://localhost:4173/map_designs/newest_map/'
    );
});

test('capacitor localhost uses production URLs instead of local dev URLs', () => {
    const context = loadConfig('capacitor://localhost/index.html');

    assert.equal(vm.runInContext('isLocalMicMapHost()', context), false);
    assert.equal(
        vm.runInContext('resolveApiBase()', context),
        'https://micmap-production.up.railway.app'
    );
    assert.equal(
        vm.runInContext('resolveAppBaseUrl()', context),
        'https://micfinder.io/'
    );
});

test('production web uses Railway API directly', () => {
    const context = loadConfig('https://micfinder.io/');

    assert.equal(vm.runInContext('resolveApiBase()', context), 'https://micmap-production.up.railway.app');
    assert.equal(
        vm.runInContext('resolveAppBaseUrl()', context),
        'https://micfinder.io/'
    );
});
