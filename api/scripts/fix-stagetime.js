/**
 * Fix bad stageTime values in MongoDB
 * Run with: cd api && node scripts/fix-stagetime.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

const fixes = [
    // Stage time fixes
    {
        filter: { venueName: 'UCB', day: 'Sunday' },
        update: { stageTime: '2 improv scenes' }
    },
    {
        filter: { venueName: 'UCB', day: 'Tuesday' },
        update: { stageTime: '10min' }
    },
    {
        filter: { venueName: 'NYC Suite Bar', day: 'Wednesday' },
        update: { stageTime: '5-7min' }
    },
    // Comedy Shop - update price and clean signUpDetails (no parens - JS adds them)
    {
        filter: { venueName: { $regex: /^Comedy Shop$/i } },
        update: {
            cost: '$8.71',
            signUpDetails: 'https://comedyshopnyc.com/events/ includes drink or fries'
        }
    },
    // Caffeine Underground - clean up wording
    {
        filter: { venueName: 'Caffeine Underground', day: 'Sunday' },
        update: { signUpDetails: 'Sign up in person. Buy something at bar.' }
    },
    // Brooklyn Dreams - fix URL with errant $0
    {
        filter: { venueName: 'Brooklyn Dreams Juice Lounge', day: 'Wednesday' },
        update: { signUpDetails: 'https://www.eventbrite.com/e/winz-35-presents-brooklyn-dreams-open-mic-tickets-1840589906959' }
    },
    // Eastpoint Bar - clean cost
    {
        filter: { venueName: 'Eastpoint Bar' },
        update: { cost: '1 item min' }
    },
    // Pioneers Bar - clean cost
    {
        filter: { venueName: 'Pioneers Bar' },
        update: { cost: '$5-7' }
    },
    // Harlem Nights Bar - clean cost
    {
        filter: { venueName: 'Harlem Nights Bar' },
        update: { cost: '$7.62' }
    }
];

async function run() {
    if (!MONGODB_URI) {
        console.error('MONGODB_URI not found in environment');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const collection = mongoose.connection.collection('mics');

        for (const fix of fixes) {
            const result = await collection.updateMany(fix.filter, { $set: fix.update });
            const venueName = fix.filter.venueName?.$regex || fix.filter.venueName || 'multiple';
            const day = fix.filter.day || 'all days';
            console.log(`Updated ${result.modifiedCount} record(s) for ${venueName} (${day})`);
        }

        console.log('\nDone!');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
