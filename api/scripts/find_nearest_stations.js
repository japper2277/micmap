const fs = require('fs');

// Haversine formula for distance between two lat/lng points
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Parse subway stations CSV
const stationsCSV = fs.readFileSync('./subway_stations.csv', 'utf8');
const stationLines = stationsCSV.trim().split('\n');
const stations = [];

for (let i = 1; i < stationLines.length; i++) {
  const parts = stationLines[i].split(',');
  const name = parts[5];
  const lat = parseFloat(parts[9]);
  const lng = parseFloat(parts[10]);
  const routes = parts[7];
  if (name && !isNaN(lat) && !isNaN(lng)) {
    stations.push({ name, lat, lng, routes });
  }
}

// Dedupe stations by name (keep first occurrence)
const uniqueStations = [];
const seenNames = new Set();
for (const s of stations) {
  if (!seenNames.has(s.name)) {
    seenNames.add(s.name);
    uniqueStations.push(s);
  }
}

console.log(`Loaded ${uniqueStations.length} unique subway stations\n`);

// Venue list (from user's data)
const venues = [
  { name: "iNINE Bistro", lat: 40.8067535, lng: -73.9266818, hood: "South Bronx" },
  { name: "Alligator Lounge", lat: 40.7139062, lng: -73.9489165, hood: "Williamsburg" },
  { name: "Alphaville (Myrtle)", lat: 40.698006, lng: -73.925272, hood: "Bushwick" },
  { name: "Alphaville Bar (Wilson)", lat: 40.7005289, lng: -73.9258157, hood: "Bushwick" },
  { name: "BKLYN Made Comedy", lat: 40.6939773, lng: -73.9073961, hood: "Bushwick" },
  { name: "Block Hill Station", lat: 40.6605429, lng: -73.9945714, hood: "Park Slope" },
  { name: "Branded Saloon", lat: 40.6792534, lng: -73.968081, hood: "Park Slope" },
  { name: "Brooklyn Art Haus", lat: 40.7133906, lng: -73.9549636, hood: "Williamsburg" },
  { name: "Brooklyn Comedy Collective", lat: 40.7077362, lng: -73.9434301, hood: "East Williamsburg" },
  { name: "Brooklyn Dreams", lat: 40.6910162, lng: -73.9249124, hood: "Bushwick" },
  { name: "Bushwick Comedy Club", lat: 40.702, lng: -73.9299503, hood: "Bushwick" },
  { name: "Caffeine Underground", lat: 40.6922369, lng: -73.9144937, hood: "Bushwick" },
  { name: "Cobra Club", lat: 40.7066852, lng: -73.9235217, hood: "East Williamsburg" },
  { name: "Commune BK", lat: 40.686831, lng: -73.9593734, hood: "Bed Stuy" },
  { name: "Corner Store BK", lat: 40.6715078, lng: -73.9502019, hood: "Crown Heights" },
  { name: "Eastville Comedy Club", lat: 40.6859068, lng: -73.9816185, hood: "Downtown Brooklyn" },
  { name: "Easy Lover BK", lat: 40.7145615, lng: -73.9425485, hood: "Williamsburg" },
  { name: "Echo Bravo", lat: 40.7079355, lng: -73.9216365, hood: "Bushwick" },
  { name: "Fiction Bar", lat: 40.7073204, lng: -73.9537223, hood: "East Williamsburg" },
  { name: "Flop House Comedy Club", lat: 40.7122083, lng: -73.9557789, hood: "Williamsburg" },
  { name: "Freddy's", lat: 40.6632901, lng: -73.9911383, hood: "Park Slope" },
  { name: "Good Judy", lat: 40.6652417, lng: -73.9892672, hood: "Park Slope" },
  { name: "Gutter Bar", lat: 40.7227408, lng: -73.9554759, hood: "Williamsburg" },
  { name: "Halyards", lat: 40.6732561, lng: -73.9897416, hood: "Gowanus" },
  { name: "Hell Phone", lat: 40.7042359, lng: -73.934179, hood: "Williamsburg" },
  { name: "Island Ribhouse", lat: 40.6762978, lng: -73.9496345, hood: "Crown Heights" },
  { name: "Isola", lat: 40.7142437, lng: -73.9558401, hood: "Williamsburg" },
  { name: "Logan's Run Bar", lat: 40.662189, lng: -73.9925465, hood: "Park Slope" },
  { name: "O'Keefe's Bar", lat: 40.6920277, lng: -73.9914226, hood: "Downtown Brooklyn" },
  { name: "Pete's Candy Store", lat: 40.7180926, lng: -73.9502883, hood: "Williamsburg" },
  { name: "Pine Box Rock Shop", lat: 40.7052293, lng: -73.9326664, hood: "East Williamsburg" },
  { name: "Rose R&R Bar", lat: 40.719117, lng: -73.9454171, hood: "Williamsburg" },
  { name: "Second City BlackBox", lat: 40.7207729, lng: -73.9596507, hood: "Williamsburg" },
  { name: "Secret Pour", lat: 40.6937282, lng: -73.9298594, hood: "Bushwick" },
  { name: "Starr Bar", lat: 40.7049722, lng: -73.9229059, hood: "Bushwick" },
  { name: "Talon Bar", lat: 40.7011038, lng: -73.9143729, hood: "Bushwick" },
  { name: "The Daily Press", lat: 40.6787074, lng: -73.9107399, hood: "Clinton Hill" },
  { name: "The Tiny Cupboard", lat: 40.6836915, lng: -73.9112136, hood: "Bushwick" },
  { name: "Black Cat LES", lat: 40.7190777, lng: -73.9912865, hood: "LES" },
  { name: "Broadway Comedy Club", lat: 40.7644391, lng: -73.9856707, hood: "Hell's Kitchen" },
  { name: "Caravan of Dreams", lat: 40.7264058, lng: -73.9856462, hood: "East Village" },
  { name: "Comedy in Harlem", lat: 40.8255092, lng: -73.9433543, hood: "Harlem" },
  { name: "Comedy Shop", lat: 40.7288305, lng: -74.0001342, hood: "Greenwich Village" },
  { name: "Comedy Village", lat: 40.7593093, lng: -73.9911149, hood: "Hell's Kitchen" },
  { name: "Comic Strip Live", lat: 40.7748581, lng: -73.9536956, hood: "UES" },
  { name: "Eastpoint Bar", lat: 40.7222419, lng: -73.9830182, hood: "East Village" },
  { name: "Enoch's", lat: 40.7562531, lng: -73.9976964, hood: "Hudson Yards" },
  { name: "Fear City Comedy Club", lat: 40.7152631, lng: -73.9901598, hood: "LES" },
  { name: "FRIGID Theater", lat: 40.7272575, lng: -73.9847924, hood: "East Village" },
  { name: "Greenwich Village Comedy", lat: 40.7296565, lng: -74.001091, hood: "Greenwich Village" },
  { name: "Grey Mare", lat: 40.7260295, lng: -73.9899072, hood: "LES" },
  { name: "Grisly Pear", lat: 40.7298491, lng: -74.0008199, hood: "Greenwich Village" },
  { name: "Grisly Pear Midtown", lat: 40.7645366, lng: -73.9833266, hood: "Midtown" },
  { name: "Harlem Nights Bar", lat: 40.8172204, lng: -73.9419721, hood: "Harlem" },
  { name: "Hotel Edison", lat: 40.759647, lng: -73.9862944, hood: "Midtown" },
  { name: "Housewatch", lat: 40.7231925, lng: -73.982715, hood: "East Village" },
  { name: "Idaho Bar", lat: 40.7309458, lng: -73.9833528, hood: "East Village" },
  { name: "Janice's apt", lat: 40.7598818, lng: -73.9874267, hood: "Hell's Kitchen" },
  { name: "Judy Z's", lat: 40.7297052, lng: -74.0048523, hood: "West Village" },
  { name: "KGB Bar", lat: 40.7265891, lng: -73.9898025, hood: "East Village" },
  { name: "Luxor Lounge", lat: 40.7297418, lng: -74.0004218, hood: "Greenwich Village" },
  { name: "NYCC East Village", lat: 40.7265891, lng: -73.9898025, hood: "East Village" },
  { name: "NYCC Midtown", lat: 40.7389213, lng: -73.9808057, hood: "Gramercy" },
  { name: "NYC Suite Bar", lat: 40.8026454, lng: -73.964587, hood: "UWS" },
  { name: "Oh Craft Beer Harlem", lat: 40.8259371, lng: -73.9468664, hood: "Harlem" },
  { name: "One and One", lat: 40.7232525, lng: -73.9881492, hood: "East Village" },
  { name: "Phoenix Bar Ave A", lat: 40.7299744, lng: -73.9811697, hood: "East Village" },
  { name: "Producer's Club", lat: 40.7595017, lng: -73.9914437, hood: "Hell's Kitchen" },
  { name: "Pubkey", lat: 40.732185, lng: -74.0000205, hood: "Greenwich Village" },
  { name: "Rodney's", lat: 40.7610441, lng: -73.960624, hood: "UES" },
  { name: "Sesh Comedy", lat: 40.7190777, lng: -73.9912865, hood: "LES" },
  { name: "SkyBox Sports Bar", lat: 40.7955865, lng: -73.9360676, hood: "UES" },
  { name: "Soho Playhouse", lat: 40.7264507, lng: -74.0043756, hood: "SoHo" },
  { name: "St. Marks Comedy Club", lat: 40.7290207, lng: -73.9893198, hood: "East Village" },
  { name: "Stella & Fly", lat: 40.7785553, lng: -73.9485889, hood: "Upper East Side" },
  { name: "Stumble Inn", lat: 40.771213, lng: -73.9563888, hood: "UES" },
  { name: "Tara Mor", lat: 40.7480429, lng: -73.9919743, hood: "Chelsea" },
  { name: "The Buddha Room", lat: 40.7498782, lng: -73.9947359, hood: "Midtown" },
  { name: "The Pit Midtown", lat: 40.7474462, lng: -73.9922022, hood: "Midtown" },
  { name: "The Stand", lat: 40.7353379, lng: -73.988463, hood: "Union Square" },
  { name: "UCB", lat: 40.7328695, lng: -73.9853584, hood: "East Village" },
  { name: "West Side Comedy Club", lat: 40.7808191, lng: -73.9805102, hood: "UWS" },
  { name: "Cool Beans Coffee", lat: 40.7486201, lng: -73.9130718, hood: "Astoria" },
  { name: "Grove 34", lat: 40.7674298, lng: -73.9329303, hood: "Astoria" },
  { name: "QED Astoria", lat: 40.775548, lng: -73.9149401, hood: "Astoria" },
  { name: "Sanger Hall", lat: 40.7463932, lng: -73.9164999, hood: "Sunnyside" },
  { name: "Scorpion Records", lat: 40.7024343, lng: -73.9048087, hood: "Ridgewood" },
  { name: "Windjammer", lat: 40.7093075, lng: -73.9070026, hood: "Ridgewood" },
];

// Find nearest station for each venue
const results = [];
const nearbyStations = new Map(); // Track unique stations within 0.3mi of venues

for (const venue of venues) {
  let nearest = null;
  let minDist = Infinity;

  for (const station of uniqueStations) {
    const dist = getDistance(venue.lat, venue.lng, station.lat, station.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = station;
    }
  }

  results.push({
    venue: venue.name,
    hood: venue.hood,
    station: nearest.name,
    routes: nearest.routes,
    distance: minDist.toFixed(2),
    stationLat: nearest.lat,
    stationLng: nearest.lng
  });

  // Track stations within 0.3 miles
  if (minDist <= 0.3) {
    const key = nearest.name;
    if (!nearbyStations.has(key)) {
      nearbyStations.set(key, {
        name: nearest.name,
        routes: nearest.routes,
        lat: nearest.lat,
        lng: nearest.lng,
        venueCount: 0
      });
    }
    nearbyStations.get(key).venueCount++;
  }
}

// Print results
console.log("=== VENUE → NEAREST STATION ===\n");
for (const r of results) {
  console.log(`${r.venue} (${r.hood})`);
  console.log(`  → ${r.station} [${r.routes}] - ${r.distance} mi`);
  console.log();
}

// Print unique stations that could be origin clusters
console.log("\n=== ORIGIN CLUSTER CANDIDATES (stations within 0.3mi of venues) ===\n");
const sortedStations = [...nearbyStations.values()].sort((a,b) => b.venueCount - a.venueCount);
for (const s of sortedStations) {
  console.log(`${s.name} [${s.routes}] - ${s.venueCount} venues nearby`);
  console.log(`  lat: ${s.lat}, lng: ${s.lng}`);
}

console.log(`\n✅ Total unique stations needed: ${nearbyStations.size}`);
