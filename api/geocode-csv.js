// Geocode all venues in the CSV and add lat/lon columns
const fs = require('fs');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');

// Simple geocoding using Nominatim (free, no API key)
async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MicMap/1.0' }
    });

    const data = await response.json();

    if (data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
    }
  } catch (error) {
    console.error(`Error geocoding ${address}:`, error.message);
  }

  return { lat: null, lon: null };
}

async function geocodeCSV() {
  const inputFile = './mics.csv';
  const outputFile = './mics-geocoded.csv';

  const results = [];

  // Read CSV
  await new Promise((resolve) => {
    fs.createReadStream(inputFile)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', resolve);
  });

  console.log(`📊 Found ${results.length} mics to geocode`);

  // Track unique venues
  const venues = new Map();

  results.forEach(row => {
    const venueName = row.venue_name;
    const address = row.address;

    if (venueName && address && !venues.has(venueName)) {
      venues.set(venueName, address);
    }
  });

  console.log(`📍 Found ${venues.size} unique venues`);

  // Geocode each unique venue
  const geocoded = new Map();
  let count = 0;

  for (const [venueName, address] of venues.entries()) {
    count++;
    console.log(`[${count}/${venues.size}] Geocoding ${venueName}...`);

    const coords = await geocode(address + ', New York, NY');
    geocoded.set(venueName, coords);

    // Rate limit: 1 request per second for Nominatim
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Add coordinates to results
  const enriched = results.map(row => {
    const coords = geocoded.get(row.venue_name) || { lat: null, lon: null };
    return {
      ...row,
      latitude: coords.lat,
      longitude: coords.lon
    };
  });

  // Write new CSV
  const csvWriter = createObjectCsvWriter({
    path: outputFile,
    header: [
      ...Object.keys(results[0]).map(key => ({ id: key, title: key })),
      { id: 'latitude', title: 'latitude' },
      { id: 'longitude', title: 'longitude' }
    ]
  });

  await csvWriter.writeRecords(enriched);

  console.log(`✅ Done! Wrote ${enriched.length} records to ${outputFile}`);
  console.log(`📊 ${geocoded.size} venues geocoded`);

  // Stats
  const withCoords = enriched.filter(r => r.latitude && r.longitude).length;
  const withoutCoords = enriched.length - withCoords;

  console.log(`\n📈 Results:`);
  console.log(`  ✅ With coordinates: ${withCoords}`);
  console.log(`  ❌ Without coordinates: ${withoutCoords}`);
}

geocodeCSV().catch(console.error);
