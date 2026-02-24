const mongoose = require('mongoose');
require('dotenv').config();

async function addComedyShop() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Create Comedy Shop mic with warning
        const result = await mongoose.connection.db.collection('mics').insertOne({
            name: "Comedy Shop Open Mic",
            venueName: "Comedy Shop",
            day: "Monday",
            startTime: "8:00 PM",
            borough: "Manhattan",
            neighborhood: "East Village",
            address: "99 MacDougal St, New York, NY 10012",
            lat: 40.729167,
            lon: -74.000556,
            cost: "Free",
            stageTime: "3-5 min",
            signUpDetails: "Sign up at venue",
            host: "TBD",
            environment: "Public Venue",
            warning: {
                message: "Multiple women have alleged sexual harassment by this venue's owner",
                link: "https://www.instagram.com/p/DUPKOE_EaCE/"
            },
            lastUpdated: new Date(),
            score: 0
        });

        console.log(`✅ Created Comedy Shop mic with warning`);
        console.log(`   ID: ${result.insertedId}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('✅ Connection closed');
    }
}

addComedyShop();
