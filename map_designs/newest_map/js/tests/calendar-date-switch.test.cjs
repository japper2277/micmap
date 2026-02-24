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
    const elementStore = new Map();
    const createClassList = () => {
        const classes = new Set();
        return {
            add(name) { classes.add(name); },
            remove(name) { classes.delete(name); },
            toggle(name, force) {
                if (force === true) {
                    classes.add(name);
                    return true;
                }
                if (force === false) {
                    classes.delete(name);
                    return false;
                }
                if (classes.has(name)) {
                    classes.delete(name);
                    return false;
                }
                classes.add(name);
                return true;
            },
            contains(name) { return classes.has(name); }
        };
    };
    const getMockElement = (id) => {
        if (elementStore.has(id)) return elementStore.get(id);
        const attrs = {};
        const el = {
            id,
            classList: createClassList(),
            style: {},
            dataset: {},
            innerHTML: '',
            textContent: '',
            title: '',
            setAttribute(name, value) { attrs[name] = String(value); },
            getAttribute(name) { return attrs[name] ?? null; },
            appendChild() {},
            querySelector() { return null; },
            querySelectorAll() { return []; }
        };
        elementStore.set(id, el);
        return el;
    };

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
        getElementById(id) { return getMockElement(id); },
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

test('calendar chip shows full date context with schedule count', () => {
    const sampleDate = new Date(2026, 2, 13, 12, 0, 0);
    const fri = sampleDate.toDateString();
    const expectedShort = `${sampleDate.toLocaleDateString('en-US', { weekday: 'short' })} ${sampleDate.toLocaleDateString('en-US', { month: 'short' })} ${sampleDate.getDate()}`;
    STATE.schedules = { [fri]: ['f1', 'f2'] };
    STATE.mics = [{ id: 'f1' }, { id: 'f2' }];

    updateCalendarButtonDisplay(fri);

    assert.equal(document.getElementById('cal-text').textContent, `${expectedShort} · 2 scheduled`);
    assert.equal(document.getElementById('mobile-cal-text').textContent, expectedShort);
    assert.match(document.getElementById('btn-calendar').title, /2 scheduled mics/);
});
