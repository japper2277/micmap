const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

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

function bootstrap() {
    global.STATE = {
        currentMode: 'today',
        selectedCalendarDate: '',
        schedules: {},
        route: [],
        dismissed: [],
        planMode: false,
        mics: []
    };

    global.localStorage = makeLocalStorage();

    global.document = {
        querySelectorAll() { return []; },
        getElementById() {
            return {
                classList: { add() {}, remove() {}, contains() { return false; } },
                style: {},
                setAttribute() {},
                innerHTML: ''
            };
        },
        createElement() {
            return { style: {}, appendChild() {}, setAttribute() {}, classList: { add() {}, remove() {}, toggle() {} } };
        },
        head: { appendChild() {} }
    };

    global.window = { innerWidth: 375 };
    global.addDays = (date, days) => {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d;
    };

    global.hideDateCarousel = () => {};
    global.updateCalendarButtonDisplay = () => {};
    global.renderCalendarDots = () => {};
    global.syncSharedStateFromMicMap = () => {};
    global.transitService = { calculateFromOrigin() {} };
    global.resetFilters = () => {};

    global.renderCalls = [];
    global.render = (mode) => renderCalls.push(mode);
    global.updateMarkerStatesCalls = 0;
    global.updateMarkerStates = () => { updateMarkerStatesCalls += 1; };
    global.updateRouteClassCalls = 0;
    global.updateRouteClass = () => { updateRouteClassCalls += 1; };
    global.updateRouteLineCalls = 0;
    global.updateRouteLine = () => { updateRouteLineCalls += 1; };
}

bootstrap();
vm.runInThisContext(
    fs.readFileSync('/Users/jaredapper/Desktop/micmap/map_designs/newest_map/js/calendar.js', 'utf8'),
    { filename: 'calendar.js' }
);

test('selectDate loads that date schedule even when not in plan mode', () => {
    const fri = new Date('2026-03-13').toDateString();
    const wed = new Date('2026-03-11').toDateString();

    STATE.planMode = false;
    STATE.mics = [{ id: 'w1' }, { id: 'f1' }];
    STATE.schedules = {
        [wed]: ['w1'],
        [fri]: ['f1']
    };
    STATE.route = ['w1'];

    selectDate(fri);

    assert.equal(STATE.currentMode, 'calendar');
    assert.equal(STATE.selectedCalendarDate, fri);
    assert.deepEqual(STATE.route, ['f1']);
    assert.equal(renderCalls.at(-1), 'calendar');
    assert.equal(updateMarkerStatesCalls > 0, true);
});

test('setMode today/tomorrow loads matching saved route', () => {
    const now = new Date();
    const today = now.toDateString();
    const tomorrow = addDays(now, 1).toDateString();

    STATE.mics = [{ id: 't1' }, { id: 'tm1' }];
    STATE.schedules = {
        [today]: ['t1'],
        [tomorrow]: ['tm1']
    };

    setMode('today');
    assert.deepEqual(STATE.route, ['t1']);

    setMode('tomorrow');
    assert.deepEqual(STATE.route, ['tm1']);
});
