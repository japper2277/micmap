/**
 * Update Greenwich Village Comedy Club mics to match current flyer (Feb 2026)
 * - Add missing time slots (Sun 4pm/5pm, Wed 1-4pm, Fri 1-3pm)
 * - Keep existing entries that match
 * - Note: * times = 1 hr, 10 comics or less, must stay entire time
 *
 * Run with: cd api && node scripts/fix-gvcc.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

const venue = {
    venueName: 'Greenwich Village Comedy Club',
    address: '99 MacDougal St, New York, NY 10012',
    borough: 'Manhattan',
    neighborhood: 'Greenwich Village',
    lat: 40.7296565,
    lon: -74.001091
};

const common = {
    cost: '$5 cash',
    signUpDetails: 'Email DrewAndPeterMic@gmail.com',
    host: 'Drew Tessier (@comedybydrew)',
};

const starNote = '1 hr, 10 comics or less. Must stay entire time.';

const allMics = [
    // Sunday: 3pm*, 4pm*, 5pm
    { ...venue, ...common, name: 'Greenwich Village Comedy Club Mic', day: 'Sunday', startTime: '3:00 PM', endTime: '4:00 PM', stageTime: 5, notes: starNote },
    { ...venue, ...common, name: 'Greenwich Village Comedy Club Mic', day: 'Sunday', startTime: '4:00 PM', endTime: '5:00 PM', stageTime: 5, notes: starNote },
    { ...venue, ...common, name: 'Greenwich Village Comedy Club Mic', day: 'Sunday', startTime: '5:00 PM', endTime: '6:30 PM', stageTime: 5 },

    // Monday: 3pm
    { ...venue, ...common, name: 'Greenwich Village Comedy Club Mic', day: 'Monday', startTime: '3:00 PM', endTime: '4:30 PM', stageTime: 5 },

    // Wednesday: 1pm*, 2pm*, 3pm*, 4pm*, 5pm
    { ...venue, ...common, name: 'Greenwich Village Comedy Club Mic', day: 'Wednesday', startTime: '1:00 PM', endTime: '2:00 PM', stageTime: 5, notes: starNote },
    { ...venue, ...common, name: 'Greenwich Village Comedy Club Mic', day: 'Wednesday', startTime: '2:00 PM', endTime: '3:00 PM', stageTime: 5, notes: starNote },
    { ...venue, ...common, name: 'Greenwich Village Comedy Club Mic', day: 'Wednesday', startTime: '3:00 PM', endTime: '4:00 PM', stageTime: 5, notes: starNote },
    { ...venue, ...common, name: 'Greenwich Village Comedy Club Mic', day: 'Wednesday', startTime: '4:00 PM', endTime: '5:00 PM', stageTime: 5, notes: starNote },
    { ...venue, ...common, name: 'Greenwich Village Comedy Club Mic', day: 'Wednesday', startTime: '5:00 PM', endTime: '6:30 PM', stageTime: 5 },

    // Friday: 1pm*, 2pm*, 3pm
    { ...venue, ...common, name: 'Greenwich Village Comedy Club Mic', day: 'Friday', startTime: '1:00 PM', endTime: '2:00 PM', stageTime: 5, notes: starNote },
    { ...venue, ...common, name: 'Greenwich Village Comedy Club Mic', day: 'Friday', startTime: '2:00 PM', endTime: '3:00 PM', stageTime: 5, notes: starNote },
    { ...venue, ...common, name: 'Greenwich Village Comedy Club Mic', day: 'Friday', startTime: '3:00 PM', endTime: '4:30 PM', stageTime: 5 },
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

        // Delete existing GVCC mics (keep Steve Arons Tuesday mic separate)
        const deleteResult = await collection.deleteMany({
            venueName: { $regex: /^Greenwich Village Comedy Club$/i },
            name: { $regex: /^Greenwich Village Comedy Club/i }
        });
        console.log(`Deleted ${deleteResult.deletedCount} existing GVCC entries`);

        // Insert fresh entries
        const insertResult = await collection.insertMany(allMics);
        console.log(`Inserted ${insertResult.insertedCount} new GVCC entries`);

        // Clear Redis cache
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

        console.log('\nDone! GVCC mics updated to match flyer.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
