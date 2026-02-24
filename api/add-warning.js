const mongoose = require('mongoose');
require('dotenv').config();

async function addWarning() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const result = await mongoose.connection.db.collection('mics').updateMany(
            { venueName: "Comedy Shop" },
            {
                $set: {
                    warning: {
                        message: "Multiple women have alleged sexual harassment by this venue's owner",
                        link: "https://www.instagram.com/p/DUPKOE_EaCE/"
                    }
                }
            }
        );

        console.log(`✅ Updated ${result.modifiedCount} Comedy Shop mic(s) with warning`);
        console.log(`   Matched ${result.matchedCount} document(s)`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('✅ Connection closed');
    }
}

addWarning();
