/* =================================================================
   CONFIG
   Application constants and configuration
   ================================================================= */

const PRODUCTION_API_BASE = 'https://micmap-production.up.railway.app';
const LOCAL_API_BASE = 'http://127.0.0.1:3001';
const PRODUCTION_APP_BASE = 'https://micfinder.io/';
const LEGACY_LOCAL_API_BASES = new Set([
    'http://127.0.0.1:3011',
    'http://localhost:3011'
]);

function isLocalMicMapHost(
    hostname = window.location.hostname,
    protocol = window.location.protocol
) {
    const isLoopbackHost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isHttpDevProtocol = protocol === 'http:' || protocol === 'https:';

    // Capacitor uses localhost with a non-http scheme in production, so only
    // treat loopback http(s) origins as local development.
    return isLoopbackHost && isHttpDevProtocol;
}

function readMicMapOverride(name) {
    try {
        const params = new URLSearchParams(window.location.search);
        const queryValue = params.get(name);
        if (queryValue) return queryValue.trim();
    } catch (_) {
        // Ignore query parsing issues.
    }

    if (!isLocalMicMapHost()) {
        return '';
    }

    try {
        const storageValue = localStorage.getItem(`micmap:${name}`);
        if (storageValue) return storageValue.trim();
    } catch (_) {
        // Ignore storage access issues.
    }

    return '';
}

function persistMicMapOverridesFromQuery() {
    if (!isLocalMicMapHost()) {
        return;
    }

    try {
        const params = new URLSearchParams(window.location.search);
        ['apiBase', 'appBase'].forEach((key) => {
            const value = params.get(key);
            if (value) {
                localStorage.setItem(`micmap:${key}`, value.trim());
            }
        });
    } catch (_) {
        // Ignore query/storage issues.
    }
}

function normalizeBaseUrl(url, fallback) {
    const raw = String(url || '').trim();
    if (!raw) return fallback;

    try {
        const parsed = new URL(raw);
        if (!['http:', 'https:'].includes(parsed.protocol)) return fallback;
        return parsed.toString().replace(/\/?$/, '/');
    } catch (_) {
        return fallback;
    }
}

function normalizeLocalApiOverride(url) {
    const normalized = String(url || '').trim().replace(/\/$/, '');
    if (!normalized) return '';
    if (LEGACY_LOCAL_API_BASES.has(normalized)) {
        return LOCAL_API_BASE;
    }
    return normalized;
}

function applyMicMapLinkOverrides(url) {
    const nextUrl = new URL(url.toString());
    const apiBaseOverride = readMicMapOverride('apiBase');
    const appBaseOverride = readMicMapOverride('appBase');

    if (apiBaseOverride) nextUrl.searchParams.set('apiBase', apiBaseOverride);
    if (appBaseOverride) nextUrl.searchParams.set('appBase', appBaseOverride);

    return nextUrl.toString();
}

function resolveAppBaseUrl() {
    const override = readMicMapOverride('appBase');
    if (override) return normalizeBaseUrl(override, PRODUCTION_APP_BASE);

    if (window.location.protocol === 'file:') {
        return PRODUCTION_APP_BASE;
    }

    if (isLocalMicMapHost()) {
        const href = window.location.href;
        const pathname = window.location.pathname || '';
        if (pathname.includes('/share/')) {
            return new URL('../', href).toString();
        }
        return new URL('./', href).toString();
    }

    return PRODUCTION_APP_BASE;
}

function resolveApiBase() {
    const override = normalizeLocalApiOverride(readMicMapOverride('apiBase'));
    if (override) {
        if (isLocalMicMapHost()) {
            try {
                localStorage.setItem('micmap:apiBase', override);
            } catch (_) {
                // Ignore storage issues.
            }
        }
        return override.replace(/\/$/, '');
    }

    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        if (isLocalMicMapHost()) {
            return LOCAL_API_BASE;
        }
        return PRODUCTION_API_BASE;
    }

    if (isLocalMicMapHost()) {
        return LOCAL_API_BASE;
    }

    return PRODUCTION_API_BASE;
}

function buildSharedPlanInviteUrl(shareId, appBaseUrl = resolveAppBaseUrl()) {
    const base = normalizeBaseUrl(appBaseUrl, PRODUCTION_APP_BASE);
    return applyMicMapLinkOverrides(new URL(`share/?shared=${encodeURIComponent(shareId)}`, base));
}

function buildSharedPlanMapUrl(shareId, appBaseUrl = resolveAppBaseUrl()) {
    const base = normalizeBaseUrl(appBaseUrl, PRODUCTION_APP_BASE);
    return applyMicMapLinkOverrides(new URL(`?shared=${encodeURIComponent(shareId)}`, base));
}

function buildLegacyPlanInviteUrl(planParam, hostName = '', appBaseUrl = resolveAppBaseUrl()) {
    const base = normalizeBaseUrl(appBaseUrl, PRODUCTION_APP_BASE);
    const url = new URL('share/', base);
    url.searchParams.set('plan', planParam);
    if (hostName) url.searchParams.set('by', hostName);
    return applyMicMapLinkOverrides(url);
}

function buildLegacyPlanMapUrl(planParam, appBaseUrl = resolveAppBaseUrl()) {
    const base = normalizeBaseUrl(appBaseUrl, PRODUCTION_APP_BASE);
    const url = new URL(base);
    url.searchParams.set('plan', planParam);
    return applyMicMapLinkOverrides(url);
}

const API_BASE = resolveApiBase();
persistMicMapOverridesFromQuery();

const VENUE_IMAGES = {
    'greenwich-village-comedy-club': 'greenwich-village-comedy-club.png',
    'the-stand': 'the-stand.png',
    'grisly-pear': 'grisly-pear.png',
    'grisly-pear-midtown': 'grisly-pear.png',
};

function getVenueImage(venueName) {
    if (!venueName) return null;
    const key = venueName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (VENUE_IMAGES[key]) return `img/venues/${VENUE_IMAGES[key]}`;
    return null;
}

const CONFIG = {
    googleClientId: '260848345140-38bvd28gsmb36sp61302cgt5p4ul72ql.apps.googleusercontent.com',
    dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    supportsAfterMidnightMics: false,
    apiBase: API_BASE,
    apiPath: `${API_BASE}/api/v1/mics`,
    mapCenter: [40.725, -73.985],
    desktopMapCenter: [40.72, -74.02],  // Shifted for drawer offset
    mapZoom: 13,
    mobileMapZoom: 13,
    filterCycles: {
        price: ['All', 'Free', 'Paid'],
        time: ['All', 'afternoon', 'evening', 'latenight'],
        commute: ['All', 15, 30, 45, 60],
        borough: ['All', 'Manhattan', 'Brooklyn', 'Queens', 'Bronx']
    },
    filterLabels: {
        price: { All: 'Price', Free: 'Free', Paid: 'Paid' },
        time: { All: 'Time', afternoon: '12-5pm', evening: '5-9pm', latenight: '9pm+', custom: 'Custom' },
        commute: { All: 'Commute', 15: '< 15m', 30: '< 30m', 45: '< 45m', 60: '< 1hr' },
        borough: { All: 'Borough', Manhattan: 'Manhattan', Brooklyn: 'Brooklyn', Queens: 'Queens', Bronx: 'Bronx' }
    },
    mobileFilterLabels: {
        price: { All: 'Price', Free: 'Free', Paid: 'Paid' },
        time: { All: 'Time', afternoon: '12-5pm', evening: '5-9pm', latenight: '9pm+', custom: 'Custom' },
        commute: { All: 'Commute', 15: '< 15m', 30: '< 30m', 45: '< 45m', 60: '< 1hr' },
        borough: { All: 'Borough', Manhattan: 'Manhattan', Brooklyn: 'Brooklyn', Queens: 'Queens', Bronx: 'Bronx' }
    },
    timeRanges: {
        All: { start: 0, end: 24 },
        afternoon: { start: 12, end: 17 },   // 12pm - 5pm
        evening: { start: 17, end: 21 },     // 5pm - 9pm
        latenight: { start: 21, end: 24 },   // 9pm - midnight
        custom: { start: 0, end: 24 }        // User-defined (updated dynamically)
    }
};
