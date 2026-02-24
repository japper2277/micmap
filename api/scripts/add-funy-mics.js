/**
 * Add new FUNY Open Mic slots at West Side Comedy Club
 * Source: punchup.live/v/funyopenmic/calendar (Feb 2026)
 *
 * Run with: cd api && node scripts/add-funy-mics.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
    if (!MONGODB_URI) {
        console.error('MONGODB_URI not found');
        process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const col = mongoose.connection.collection('mics');
    let added = 0;
    let skipped = 0;

    // Get existing WSCC entry for venue details
    const wscc = await col.findOne({ venueName: 'West Side Comedy Club' });
    if (!wscc) {
        console.error('West Side Comedy Club not found in DB!');
        process.exit(1);
    }

    const base = {
        venueName: 'West Side Comedy Club',
        borough: wscc.borough,
        neighborhood: wscc.neighborhood,
        address: wscc.address || '201 W 75th St, New York, NY 10023',
        lat: wscc.lat,
        lon: wscc.lon,
        cost: '$7.38',
        signUpDetails: 'https://punchup.live/v/funyopenmic',
        notes: 'Sign up online via Punchup ($2.38 fee)',
    };

    const newMics = [
        {
            name: "Brett Singer's Open Mic",
            day: 'Tuesday',
            startTime: '4:00 PM',
            stageTime: '5min',
            host: 'Brett Singer',
        },
        {
            name: "Open Mic with Jonno",
            day: 'Wednesday',
            startTime: '1:00 PM',
            stageTime: '5min',
            host: 'Jonno',
        },
        {
            name: "Zoe Levy's Open Mic",
            day: 'Wednesday',
            startTime: '3:00 PM',
            stageTime: '5min',
            host: 'Zoe Levy',
        },
        {
            name: "10 Minute Feedback Open Mic",
            day: 'Thursday',
            startTime: '12:30 PM',
            stageTime: '10min',
            host: 'Olivia Barbulescu',
        },
        {
            name: "Headliners First Open Mic",
            day: 'Thursday',
            startTime: '3:00 PM',
            stageTime: '5min',
            host: 'TBD',
        },
        {
            name: "Rory Lutz's Open Mic",
            day: 'Friday',
            startTime: '3:00 PM',
            stageTime: '5min',
            host: 'Rory Lutz',
        },
        {
            name: "Shareef Taher's Open Mic",
            day: 'Friday',
            startTime: '5:00 PM',
            stageTime: '5min',
            host: 'Shareef Taher',
        },
        {
            name: "Reuben Wolf's Open Mic",
            day: 'Saturday',
            startTime: '3:00 PM',
            stageTime: '5min',
            host: 'Reuben Wolf',
        },
    ];

    console.log('--- ADDING FUNY MICS ---');

    for (const mic of newMics) {
        // Check if already exists
        const exists = await col.findOne({
            venueName: 'West Side Comedy Club',
            day: mic.day,
            startTime: mic.startTime,
        });

        if (exists) {
            console.log(`  - SKIP (exists): ${mic.day} ${mic.startTime} — ${mic.name}`);
            skipped++;
            continue;
        }

        await col.insertOne({
            ...base,
            name: mic.name,
            day: mic.day,
            startTime: mic.startTime,
            endTime: null,
            stageTime: mic.stageTime,
            host: mic.host,
        });
        console.log(`  + ADDED: ${mic.day} ${mic.startTime} — ${mic.name}`);
        added++;
    }

    // Clear Redis cache
    try {
        const Redis = require('ioredis');
        const redis = new Redis(process.env.REDIS_URL);
        const keys = await redis.keys('micmap:mics:*');
        if (keys.length > 0) await redis.del(...keys);
        console.log(`\nCleared ${keys.length} Redis cache entries`);
        await redis.quit();
    } catch (e) {
        console.log('\nRedis cache clear skipped');
    }

    console.log(`\n${'='.repeat(35)}`);
    console.log(`  Added:   ${added}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`${'='.repeat(35)}\n`);

    await mongoose.disconnect();
}

run().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
