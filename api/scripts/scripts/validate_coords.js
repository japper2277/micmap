// Quick validation script to find bad coordinates
const fs = require('fs');

// NYC bounding box (approximate)
const NYC_BOUNDS = {
  minLat: 40.49, maxLat: 40.92,
  minLng: -74.26, maxLng: -73.68
};

// More specific borough bounds
const BOROUGH_BOUNDS = {
  Manhattan: { minLat: 40.70, maxLat: 40.88, minLng: -74.02, maxLng: -73.90 },
  Brooklyn: { minLat: 40.57, maxLat: 40.74, minLng: -74.05, maxLng: -73.83 },
  Queens: { minLat: 40.54, maxLat: 40.80, minLng: -73.96, maxLng: -73.70 },
  Bronx: { minLat: 40.78, maxLat: 40.92, minLng: -73.93, maxLng: -73.75 }
};

// Parse venue-addresses.txt
const text = fs.readFileSync('/Users/jaredapper/Desktop/micmap/venue-addresses.txt', 'utf8');
const venues = [];

let currentVenue = null;
const lines = text.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();

  // Check if this is a venue name (not indented, not empty, not a section header)
  if (line && !line.startsWith('=') && !line.startsWith('(') && !line.startsWith('Lat:') && !line.includes('NYC COMEDY') && !line.includes('Generated') && !line.includes('Total Venues')) {
    // Check if next line is an address (starts with a number or has a street)
    const nextLine = lines[i + 1]?.trim();
    if (nextLine && (nextLine.match(/^\d/) || nextLine.includes('Ave') || nextLine.includes('St,'))) {
      currentVenue = { name: line };
    }
  }

  // Parse address
  if (currentVenue && line.match(/^\d+.*NY \d{5}/)) {
    currentVenue.address = line;
  }

  // Parse hood
  if (currentVenue && line.startsWith('(') && line.endsWith(')')) {
    currentVenue.hood = line.slice(1, -1);
  }

  // Parse coordinates
  if (currentVenue && line.startsWith('Lat:')) {
    const match = line.match(/Lat: ([\d.-]+), Lng: ([\d.-]+)/);
    if (match) {
      currentVenue.lat = parseFloat(match[1]);
      currentVenue.lng = parseFloat(match[2]);
      venues.push(currentVenue);
      currentVenue = null;
    }
  }
}

console.log(`\nFound ${venues.length} venues in venue-addresses.txt\n`);
console.log('=== COORDINATE VALIDATION ===\n');

const issues = [];

venues.forEach(v => {
  const problems = [];

  // Check if outside NYC entirely
  if (v.lat < NYC_BOUNDS.minLat || v.lat > NYC_BOUNDS.maxLat ||
      v.lng < NYC_BOUNDS.minLng || v.lng > NYC_BOUNDS.maxLng) {
    problems.push(`OUTSIDE NYC: lat=${v.lat}, lng=${v.lng}`);
  }

  // Check if coordinates are way off for the hood
  if (v.hood) {
    // Manhattan venues should have lng around -73.95 to -74.01
    if (v.hood.includes('Village') || v.hood.includes('LES') || v.hood.includes('East Village') ||
        v.hood.includes('Midtown') || v.hood.includes('Hell') || v.hood.includes('Chelsea') ||
        v.hood.includes('Harlem') || v.hood.includes('UES') || v.hood.includes('UWS') ||
        v.hood.includes('SoHo') || v.hood.includes('Union') || v.hood.includes('Gramercy') ||
        v.hood.includes('Hudson')) {
      if (v.lng > -73.90 || v.lng < -74.03) {
        problems.push(`Manhattan venue but lng=${v.lng} seems wrong`);
      }
    }

    // Brooklyn venues
    if (v.hood.includes('Williamsburg') || v.hood.includes('Bushwick') ||
        v.hood.includes('Park Slope') || v.hood.includes('Crown Heights') ||
        v.hood.includes('Downtown Brooklyn') || v.hood.includes('Gowanus') ||
        v.hood.includes('Bed Stuy') || v.hood.includes('Clinton Hill')) {
      if (v.lat > 40.75) {
        problems.push(`Brooklyn venue but lat=${v.lat} seems too north`);
      }
    }
  }

  // Check for obviously wrong coordinates
  if (v.lat > 40.85 && v.hood && !v.hood.includes('Harlem') && !v.hood.includes('Bronx')) {
    problems.push(`Very north lat=${v.lat} but hood is ${v.hood}`);
  }

  if (problems.length > 0) {
    issues.push({ venue: v, problems });
  }
});

if (issues.length === 0) {
  console.log('✅ All coordinates look valid!\n');
} else {
  console.log(`❌ Found ${issues.length} venues with potential coordinate issues:\n`);
  issues.forEach(({ venue, problems }) => {
    console.log(`${venue.name} (${venue.hood})`);
    console.log(`  Address: ${venue.address}`);
    console.log(`  Coords: ${venue.lat}, ${venue.lng}`);
    problems.forEach(p => console.log(`  ⚠️  ${p}`));
    console.log();
  });
}

// Also check for duplicates
console.log('\n=== DUPLICATE COORDINATES ===\n');
const coordMap = new Map();
venues.forEach(v => {
  const key = `${v.lat.toFixed(6)},${v.lng.toFixed(6)}`;
  if (!coordMap.has(key)) {
    coordMap.set(key, []);
  }
  coordMap.get(key).push(v.name);
});

const duplicates = [...coordMap.entries()].filter(([k, names]) => names.length > 1);
if (duplicates.length === 0) {
  console.log('✅ No duplicate coordinates\n');
} else {
  console.log(`Found ${duplicates.length} sets of venues with same coordinates:\n`);
  duplicates.forEach(([coords, names]) => {
    console.log(`📍 ${coords}`);
    names.forEach(n => console.log(`   - ${n}`));
    console.log();
  });
}
