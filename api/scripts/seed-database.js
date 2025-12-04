// seed-database.js - Import CSV data into MongoDB
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Mic = require('../models/Mic');

// Venue coordinates lookup (fallback for missing coords)
const VENUE_COORDINATES = {
  'Comedy Shop': { lat: 40.7288305, lon: -74.0001342 },
  'Greenwich Village Comedy Club': { lat: 40.7296565, lon: -74.001091 },
  'Greenwich village comedy club': { lat: 40.7296565, lon: -74.001091 },
  'Pinebox': { lat: 40.7052293, lon: -73.9326664 },
  'Pine Box Rock Shop': { lat: 40.7052293, lon: -73.9326664 },
  'UWS NY Comedy Club': { lat: 40.7808191, lon: -73.9805102 },
  'Eastville Comedy Club': { lat: 40.7142545, lon: -73.9613017 },
  'Phoenix bar': { lat: 40.7288305, lon: -74.0001342 },
  'The Comic Strip Live': { lat: 40.7748581, lon: -73.9536956 },
  'St. Mark\'s Comedy Club': { lat: 40.7748581, lon: -73.9536956 },
  'Producer\'s Club': { lat: 40.7644391, lon: -73.9856707 },
  'Caffeine Underground': { lat: 40.6836915, lon: -73.9112136 },
  'Brooklyn Art Haus': { lat: 40.7168611, lon: -73.9610679 },
  'Fear City Comedy Club': { lat: 40.7152631, lon: -73.9901598 },
  'Easy Lover BK': { lat: 40.7180926, lon: -73.9502883 },
  'Bushwick Comedy Club': { lat: 40.6955342, lon: -73.9288494 },
  'Idaho Bar': { lat: 40.7288305, lon: -74.0001342 },
  'O\'Keefe\'s Bar': { lat: 40.6784737, lon: -73.9860016 },
  'The Tiny Cupboard': { lat: 40.6836915, lon: -73.9112136 },
  'QED Astoria': { lat: 40.775548, lon: -73.9149401 },
  'The Pit Midtown': { lat: 40.7405356, lon: -73.9848055 },
  'The PIT NYC': { lat: 40.7405356, lon: -73.9848055 },
  'UCB': { lat: 40.7305356, lon: -73.9878055 },
  'Grisly Pear': { lat: 40.7318243, lon: -74.0036027 },
  'New York Comedy Club Midtown': { lat: 40.7389213, lon: -73.9808057 },
  'The Stand NYC': { lat: 40.7366948, lon: -73.9844585 },
  'Janice\'s apt': { lat: 40.7644391, lon: -73.9856707 },
  'Sesh Comedy': { lat: 40.7152631, lon: -73.9901598 },
  'BKLYN Made Comedy': { lat: 40.6955342, lon: -73.9288494 },
  'Comedy Village': { lat: 40.7644391, lon: -73.9856707 },
  'Caravan of Dreams': { lat: 40.7256, lon: -73.9831 },
  'Phoenix Bar Avenue A': { lat: 40.7288305, lon: -74.0001342 },
  'West Side Comedy Club': { lat: 40.7808191, lon: -73.9805102 },
  'Alligator Lounge': { lat: 40.7139062, lon: -73.9489165 },
  'Second City': { lat: 40.7207729, lon: -73.9596507 },
  'Pete\'s Candy Store': { lat: 40.7180926, lon: -73.9502883 },
  'Broadway Comedy Club': { lat: 40.7644391, lon: -73.9856707 },
  'Laughing Devil Comedy Club': { lat: 40.7444693, lon: -73.953783 },
  'Young Ethel\'s': { lat: 40.6784737, lon: -73.9860016 }
};

async function seedDatabase() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI not found in .env file');
    }

    console.log('📊 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    console.log('🗑️  Clearing existing mic data...');
    await Mic.deleteMany({});

    // Read CSV file
    const csvPath = path.join(__dirname, '../mics-geocoded.csv');
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found at ${csvPath}`);
    }

    console.log('📖 Reading CSV file...');
    const results = [];

    await new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`📋 Found ${results.length} rows in CSV`);

    // Process and insert mics
    const micsToInsert = [];
    let skipped = 0;

    for (const row of results) {
      const micName = row['mic_name'] ? row['mic_name'].trim() : '';
      if (!micName) {
        skipped++;
        continue;
      }

      const venueName = row['venue_name'] ? row['venue_name'].trim() : micName;

      // Get coordinates
      let lat = row['latitude'] ? parseFloat(row['latitude']) : null;
      let lon = row['longitude'] ? parseFloat(row['longitude']) : null;

      // Fallback to lookup table
      if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
        if (VENUE_COORDINATES[venueName]) {
          lat = VENUE_COORDINATES[venueName].lat;
          lon = VENUE_COORDINATES[venueName].lon;
        } else {
          console.warn(`⚠️  No coordinates for ${micName}, skipping`);
          skipped++;
          continue;
        }
      }

      const mic = {
        name: micName,
        day: row['day'] || 'Monday',
        startTime: row['start_time'] || '7:00 PM',
        endTime: row['end_time'] || null,
        venueName: venueName,
        borough: row['borough'] ? row['borough'].trim() : 'Manhattan',
        neighborhood: row['neighborhood'] ? row['neighborhood'].trim() : 'Unknown',
        address: row['address'] || null,
        lat: lat,
        lon: lon,
        cost: row['cost'] || 'Free',
        stageTime: row['stage_time_minutes'] || null,
        signUpDetails: row['signup_instructions'] || 'Check venue for details',
        host: row['organizer_contact'] || 'TBD',
        environment: 'Public Venue',
        notes: row['notes'] || null,
        score: 0
      };

      micsToInsert.push(mic);
    }

    console.log(`💾 Inserting ${micsToInsert.length} mics into MongoDB...`);
    await Mic.insertMany(micsToInsert);

    console.log(`✅ Successfully inserted ${micsToInsert.length} mics`);
    console.log(`⚠️  Skipped ${skipped} rows (missing data or coordinates)`);

    // Create indexes
    console.log('🔧 Creating indexes...');
    await Mic.createIndexes();
    console.log('✅ Indexes created');

    // Disconnect
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    console.log('\n🎉 Database seeding complete!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

// Run the seeder
seedDatabase();
