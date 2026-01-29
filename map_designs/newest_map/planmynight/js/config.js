// Plan My Night - Configuration & Constants

const API_BASE = 'https://micmap-production.up.railway.app';

const CONFIG = {
    bufferTime: 60,
    maxLateArrival: 15,
    walkSpeed: 20,
    dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
};

const LINE_COLORS = {
    '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
    '4': '#00933C', '5': '#00933C', '6': '#00933C',
    '7': '#B933AD',
    'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
    'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
    'G': '#6CBE45',
    'J': '#996633', 'Z': '#996633',
    'L': '#A7A9AC',
    'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
    'S': '#808183'
};

const DARK_TEXT_LINES = ['N', 'Q', 'R', 'W'];

// Minimal neighborhood data for demo
const NEIGHBORHOODS = [
    { name: 'Bushwick', borough: 'Brooklyn', lat: 40.6944, lng: -73.9213 },
    { name: 'Williamsburg', borough: 'Brooklyn', lat: 40.7081, lng: -73.9571 },
    { name: 'East Village', borough: 'Manhattan', lat: 40.7265, lng: -73.9815 },
    { name: 'West Village', borough: 'Manhattan', lat: 40.7358, lng: -74.0036 },
    { name: 'Astoria', borough: 'Queens', lat: 40.7720, lng: -73.9300 },
    { name: 'Lower East Side', borough: 'Manhattan', lat: 40.7150, lng: -73.9843 }
];

// Borough to neighborhood mapping
const BOROUGH_NEIGHBORHOODS = {
    Manhattan: ['East Village', 'LES', 'West Village', 'Chelsea', 'Midtown', 'Harlem', 'UWS', 'UES', 'FiDi', 'Tribeca', 'SoHo'],
    Brooklyn: ['Williamsburg', 'Bushwick', 'Greenpoint', 'Park Slope', 'DUMBO', 'Bed-Stuy', 'Crown Heights', 'Prospect Heights'],
    Queens: ['Astoria', 'LIC', 'Jackson Heights', 'Flushing', 'Forest Hills'],
    Bronx: ['South Bronx', 'Fordham', 'Riverdale']
};

// Anchor role icons and labels
const ANCHOR_ROLES = {
    start: { icon: '🎯', label: 'Start' },
    must: { icon: '📌', label: 'Must Hit' },
    end: { icon: '🏁', label: 'End' }
};
