const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
        },
        clear() {
            store.clear();
        }
    };
}

function bootstrapGlobals() {
    global.CONFIG = {
        dayNames,
        supportsAfterMidnightMics: false,
        timeRanges: {
            All: { start: 0, end: 24 },
            evening: { start: 17, end: 21 },
            latenight: { start: 21, end: 24 },
            custom: { start: 0, end: 24 }
        }
    };

    global.STATE = {
        currentMode: 'today',
        selectedCalendarDate: new Date().toDateString(),
        activeFilters: { time: 'All', price: 'All', commute: 'All', borough: 'All' },
        route: [],
        schedules: {},
        dismissed: [],
        micDurations: {},
        setDuration: 60,
        timeWindowStart: 700,
        timeWindowEnd: 1100,
        showConflictWhy: false
    };

    global.localStorage = makeLocalStorage();
    global.document = {
        addEventListener() {},
        querySelectorAll() { return []; },
        getElementById() { return null; },
        body: { classList: { add() {}, remove() {}, toggle() {} } }
    };
    global.navigator = { vibrate() {} };
    global.window = { open() {} };

    global.addDays = (date, days) => {
        const copy = new Date(date);
        copy.setDate(copy.getDate() + days);
        return copy;
    };

    global.renderCalendarDots = () => {};
    global.toastService = { show() {} };
    global.updateFilterPillUI = () => {};
    global.updateMarkerStates = () => {};
    global.render = () => {};
    global.updateRouteClass = () => {};
    global.updateRouteLine = () => {};
}

function loadScript(path) {
    const source = fs.readFileSync(path, 'utf8');
    vm.runInThisContext(source, { filename: path });
}

bootstrapGlobals();
loadScript('/Users/jaredapper/Desktop/micmap/map_designs/newest_map/js/utils.js');
loadScript('/Users/jaredapper/Desktop/micmap/map_designs/newest_map/js/planner.js');

test('active planning day comes from selected calendar date', () => {
    STATE.currentMode = 'calendar';
    STATE.selectedCalendarDate = new Date('2026-03-12T12:00:00').toDateString(); // Thursday
    assert.equal(getActivePlanningDayName(), 'Thursday');
    assert.equal(isMicInActivePlanningDay({ day: 'Thursday' }), true);
    assert.equal(isMicInActivePlanningDay({ day: 'Wednesday' }), false);
});

test('time range filtering is same-day when after-midnight support is disabled', () => {
    const late = new Date('2026-03-12T23:30:00');
    const early = new Date('2026-03-12T20:15:00');
    const range = { start: 21, end: 24 };
    assert.equal(isWithinTimeRange(toComedyMinutes(late), range), true);
    assert.equal(isWithinTimeRange(toComedyMinutes(early), range), false);
});

test('persistPlanState saves against active planning date key', () => {
    STATE.currentMode = 'today';
    STATE.selectedCalendarDate = 'Mon Jan 01 1990';
    STATE.route = ['mic-1', 'mic-2'];
    STATE.schedules = {};
    const expectedKey = getActivePlanningDate().toDateString();

    persistPlanState();

    assert.deepEqual(STATE.schedules[expectedKey], ['mic-1', 'mic-2']);
    assert.equal(STATE.selectedCalendarDate, expectedKey);
});

test('empty-state helper actions widen time filter and shorten stay', () => {
    STATE.activeFilters.time = 'evening';
    STATE.setDuration = 60;
    STATE.route = [];
    STATE.mics = [];

    widenScheduleTimeFilter();
    shortenScheduleStay();

    assert.equal(STATE.activeFilters.time, 'All');
    assert.equal(STATE.setDuration, 45);
});
