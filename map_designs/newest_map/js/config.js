/* =================================================================
   CONFIG
   Application constants and configuration
   ================================================================= */

// Detect environment - use Railway API in production, localhost in development
const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = isLocalDev ? 'http://localhost:3001' : 'https://micmap-production.up.railway.app';

const CONFIG = {
    dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    apiBase: API_BASE,
    apiPath: `${API_BASE}/api/v1/mics`,
    mapCenter: [40.735, -73.99],
    mapZoom: 13,
    filterCycles: {
        price: ['All', 'Free', 'Paid'],
        time: ['All', 'morning', 'afternoon', 'evening', 'latenight'],
        commute: ['All', 15, 30, 45, 60],
        borough: ['All', 'Manhattan', 'Brooklyn', 'Queens', 'Bronx']
    },
    filterLabels: {
        price: { All: 'Price', Free: 'Free', Paid: '< $5' },
        time: { All: 'Time', morning: '< 12pm', afternoon: '12-5pm', evening: '5-9pm', latenight: '9pm+' },
        commute: { All: 'Commute', 15: '< 15m', 30: '< 30m', 45: '< 45m', 60: '< 1hr' },
        borough: { All: 'Borough', Manhattan: 'Manhattan', Brooklyn: 'Brooklyn', Queens: 'Queens', Bronx: 'Bronx' }
    },
    timeRanges: {
        All: { start: 0, end: 24 },
        morning: { start: 0, end: 12 },      // Before 12pm
        afternoon: { start: 12, end: 17 },   // 12pm - 5pm
        evening: { start: 17, end: 21 },     // 5pm - 9pm
        latenight: { start: 21, end: 24 }    // 9pm+
    }
};
