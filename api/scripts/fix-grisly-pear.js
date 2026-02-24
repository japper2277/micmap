/**
 * Update all Grisly Pear mics to match their current flyer (Feb 2026)
 * - Fix prices to $5 cash
 * - Add missing time slots
 * - Add "cancelled 4th Tues" notes where applicable
 * - Sign up in person + 1 item min for all
 *
 * Run with: cd api && node scripts/fix-grisly-pear.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

// West Village location
const WV = {
    venueName: 'Grisly Pear',
    address: '107 MacDougal St, New York, NY 10012',
    borough: 'Manhattan',
    neighborhood: 'Greenwich Village',
    lat: 40.7298491,
    lon: -74.0008199
};

// Times Square location
const TS = {
    venueName: 'Grisly Pear Midtown',
    address: '243 W 54th St, New York, NY 10019',
    borough: 'Manhattan',
    neighborhood: 'Midtown',
    lat: 40.7645366,
    lon: -73.9833266
};

const common = {
    cost: '$5 cash',
    signUpDetails: 'Sign up in person',
    notes: 'Schedule subject to change. 1 item minimum.',
    stageTime: 5
};

// All Grisly Pear mics per the flyer
const allMics = [
    // === WEST VILLAGE (107 MacDougal St) ===
    // M/T/W/Th: 4:30 PM and 6:00 PM
    { ...WV, ...common, name: 'Grisly Pear', day: 'Monday', startTime: '4:30 PM', endTime: '6:00 PM' },
    { ...WV, ...common, name: 'Grisly Pear', day: 'Monday', startTime: '6:00 PM', endTime: '7:30 PM' },
    { ...WV, ...common, name: 'Grisly Pear', day: 'Tuesday', startTime: '4:30 PM', endTime: '6:00 PM' },
    { ...WV, ...common, name: 'Grisly Pear', day: 'Tuesday', startTime: '6:00 PM', endTime: '7:30 PM' },
    { ...WV, ...common, name: 'Grisly Pear', day: 'Wednesday', startTime: '4:30 PM', endTime: '6:00 PM' },
    { ...WV, ...common, name: 'Grisly Pear', day: 'Wednesday', startTime: '6:00 PM', endTime: '7:30 PM' },
    { ...WV, ...common, name: 'Grisly Pear', day: 'Thursday', startTime: '4:30 PM', endTime: '6:00 PM' },
    { ...WV, ...common, name: 'Grisly Pear', day: 'Thursday', startTime: '6:00 PM', endTime: '7:30 PM' },
    // Friday: 4:00 PM
    { ...WV, ...common, name: 'Grisly Pear', day: 'Friday', startTime: '4:00 PM', endTime: '5:30 PM' },
    // Sat + Sun: 2:00 PM
    { ...WV, ...common, name: 'Grisly Pear', day: 'Saturday', startTime: '2:00 PM', endTime: '3:30 PM' },
    { ...WV, ...common, name: 'Grisly Pear', day: 'Sunday', startTime: '2:00 PM', endTime: '3:30 PM' },

    // === TIMES SQUARE (243 W 54th St) ===
    // M/W/Th/F: 5:30 PM (Mon) or 5:00 PM (W/Th/F)
    { ...TS, ...common, name: 'Grisly Pear Midtown', day: 'Monday', startTime: '5:30 PM', endTime: '7:00 PM' },
    { ...TS, ...common, name: 'Grisly Pear Midtown', day: 'Wednesday', startTime: '5:00 PM', endTime: '6:30 PM' },
    { ...TS, ...common, name: 'Grisly Pear Midtown', day: 'Thursday', startTime: '5:00 PM', endTime: '6:30 PM' },
    { ...TS, ...common, name: 'Grisly Pear Midtown', day: 'Friday', startTime: '5:00 PM', endTime: '6:30 PM' },
    // Tuesday: 5:45 PM**, 7:00 PM**, 9:00 PM, 10:30 PM
    { ...TS, ...common, name: 'Grisly Pear Midtown', day: 'Tuesday', startTime: '5:45 PM', endTime: '7:00 PM',
      notes: 'Schedule subject to change. 1 item minimum. Cancelled the 4th Tuesday each month.' },
    { ...TS, ...common, name: 'Grisly Pear Midtown', day: 'Tuesday', startTime: '7:00 PM', endTime: '8:30 PM',
      notes: 'Schedule subject to change. 1 item minimum. Cancelled the 4th Tuesday each month.' },
    { ...TS, ...common, name: 'Grisly Pear Midtown', day: 'Tuesday', startTime: '9:00 PM', endTime: '10:30 PM' },
    { ...TS, ...common, name: 'Grisly Pear Midtown', day: 'Tuesday', startTime: '10:30 PM', endTime: '12:00 AM' },
    // Sat + Sun: 4:00 PM
    { ...TS, ...common, name: 'Grisly Pear Midtown', day: 'Saturday', startTime: '4:00 PM', endTime: '5:30 PM' },
    { ...TS, ...common, name: 'Grisly Pear Midtown', day: 'Sunday', startTime: '4:00 PM', endTime: '5:30 PM' },
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

        // 1. Delete all existing Grisly Pear mics (both locations)
        const deleteResult = await collection.deleteMany({
            venueName: { $regex: /grisly pear/i }
        });
        console.log(`Deleted ${deleteResult.deletedCount} existing Grisly Pear entries`);

        // 2. Insert all fresh entries from flyer
        const insertResult = await collection.insertMany(allMics);
        console.log(`Inserted ${insertResult.insertedCount} new Grisly Pear entries`);

        // 3. Clear Redis cache if available
        try {
            const Redis = require('ioredis');
            const redis = new Redis(process.env.REDIS_URL);
            const keys = await redis.keys('micmap:mics:*');
            if (keys.length > 0) {
                await redis.del(...keys);
                console.log(`Cleared ${keys.length} Redis cache entries`);
            }
            await redis.quit();
        } catch (e) {
            console.log('Redis not available, skipping cache clear');
        }

        console.log('\nDone! Grisly Pear mics updated to match flyer.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
