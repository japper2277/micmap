// Seed production database with mics from mics.json
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Mic model schema (simplified)
const micSchema = new mongoose.Schema({}, { strict: false });
const Mic = mongoose.model('Mic', micSchema);

async function seed() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is required');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Read mics.json
    const micsPath = path.join(__dirname, '..', 'mics.json');
    const micsData = JSON.parse(fs.readFileSync(micsPath, 'utf-8'));
    console.log(`📄 Found ${micsData.length} mics in mics.json`);

    // Clear existing data
    await Mic.deleteMany({});
    console.log('🗑️  Cleared existing mics');

    // Insert new data
    await Mic.insertMany(micsData);
    console.log(`✅ Inserted ${micsData.length} mics into database`);

    await mongoose.connection.close();
    console.log('✅ Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
    process.exit(1);
  }
}

seed();
