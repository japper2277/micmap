const mongoose = require('mongoose');
require('dotenv').config();

async function listVenues() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Get all unique venue names
        const venues = await mongoose.connection.db.collection('mics').distinct('venueName');

        console.log(`\nTotal unique venues: ${venues.length}`);
        console.log('\nAll venue names:');
        venues.sort().forEach(v => console.log(`  - ${v}`));

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.connection.close();
    }
}

listVenues();
