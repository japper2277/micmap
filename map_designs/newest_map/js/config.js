/* =================================================================
   CONFIG
   Application constants and configuration
   ================================================================= */

// Detect environment - use relative URLs in production, localhost in development
const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = isLocalDev ? 'http://localhost:3001' : '';

const CONFIG = {
    dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    apiBase: API_BASE,
    apiPath: `${API_BASE}/api/v1/mics`,
    mapCenter: [40.735, -73.99],
    mapZoom: 13,
    filterCycles: {
        price: ['All', 'Free', 'Paid'],
        time: ['All', 'morning', 'afternoon', 'evening', 'latenight'],
        commute: ['All', 15, 30, 45, 60]
    },
    filterLabels: {
        price: { All: 'Price', Free: 'Free', Paid: '< $5' },
        time: { All: 'Time', morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', latenight: 'Late Night' },
        commute: { All: 'Commute', 15: '< 15m', 30: '< 30m', 45: '< 45m', 60: '< 1hr' }
    },
    timeRanges: {
        All: { start: 0, end: 24 },
        morning: { start: 0, end: 12 },      // Before 12pm
        afternoon: { start: 12, end: 17 },   // 12pm - 5pm
        evening: { start: 17, end: 21 },     // 5pm - 9pm
        latenight: { start: 21, end: 24 }    // 9pm+
    }
};
