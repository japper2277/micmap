const mongoose = require('mongoose');
require('dotenv').config();

async function checkComedyShop() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Search for any mic with "comedy" and "shop" in the name
        const results = await mongoose.connection.db.collection('mics').find({
            $or: [
                { venueName: /comedy.*shop/i },
                { venue: /comedy.*shop/i },
                { name: /comedy.*shop/i }
            ]
        }).limit(5).toArray();

        console.log(`Found ${results.length} matching mics:`);
        results.forEach(mic => {
            console.log(`  - venueName: "${mic.venueName}"`);
            console.log(`    venue: "${mic.venue}"`);
            console.log(`    name: "${mic.name}"`);
            console.log(`    _id: ${mic._id}`);
            console.log('');
        });

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.connection.close();
    }
}

checkComedyShop();
