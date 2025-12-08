/* =================================================================
   CONFIG
   Application constants and configuration
   ================================================================= */

const CONFIG = {
    dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    apiBase: 'http://localhost:3001',
    apiPath: 'http://localhost:3001/api/v1/mics',
    mapCenter: [40.735, -73.99],
    mapZoom: 13,
    filterCycles: {
        price: ['All', 'Free', 'Paid'],
        time: ['All', 'early', 'late']
    },
    filterLabels: {
        price: { All: 'Price', Free: 'Free', Paid: '< $5' },
        time: { All: 'Time', early: '< 5pm', late: '5pm+' }
    }
};
