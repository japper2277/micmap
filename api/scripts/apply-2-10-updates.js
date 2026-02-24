/**
 * Apply 28 targeted mic updates from 2/10/26 data diff
 * Only real changes — no format fixes, no IG handle stripping, no cost wording changes
 *
 * Run with: cd api && node scripts/apply-2-10-updates.js
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
    let updated = 0;
    let added = 0;
    let removed = 0;

    // Helper
    async function updateOne(filter, update, label) {
        const result = await col.updateOne(filter, { $set: update });
        if (result.matchedCount > 0) {
            console.log(`  ✓ ${label}`);
            updated++;
        } else {
            console.log(`  ✗ ${label} — NOT FOUND`);
        }
    }

    async function deleteOne(filter, label) {
        const result = await col.deleteOne(filter);
        if (result.deletedCount > 0) {
            console.log(`  ✓ Removed: ${label}`);
            removed++;
        } else {
            console.log(`  ✗ Remove: ${label} — NOT FOUND`);
        }
    }

    async function insertOne(doc, label) {
        await col.insertOne(doc);
        console.log(`  ✓ Added: ${label}`);
        added++;
    }

    // =============================================
    // 1. ADD NEW VENUE
    // =============================================
    console.log('--- ADD NEW VENUE ---');
    await insertOne({
        name: 'One and One Lounge',
        day: 'Thursday',
        startTime: '6:00 PM',
        endTime: null,
        venueName: 'One and One Lounge',
        borough: 'Manhattan',
        neighborhood: 'East Village',
        address: '76 E 1st St, New York, NY 10009',
        cost: '$5 + 1 drink min',
        stageTime: null,
        signUpDetails: 'Sign up in person at 5:45 PM',
        host: 'Dion Domicello (@diondomicello)',
        notes: null,
        lat: 40.7246,
        lon: -73.9893
    }, 'One and One Lounge — Thu 6:00 PM');

    // =============================================
    // 2. TIME CHANGES
    // =============================================
    console.log('\n--- TIME CHANGES ---');

    // Block Hill Station: Tue 7:30 → 8:00
    await updateOne(
        { venueName: 'Block Hill Station', day: 'Tuesday', startTime: '7:30 PM' },
        { startTime: '8:00 PM' },
        'Block Hill Station: Tue 7:30 PM → 8:00 PM'
    );

    // Bushwick Comedy Club: Tue 7:00 → 6:30
    await updateOne(
        { venueName: 'Bushwick Comedy Club', day: 'Tuesday', startTime: '7:00 PM' },
        { startTime: '6:30 PM' },
        'Bushwick Comedy Club: Tue 7:00 PM → 6:30 PM'
    );

    // KGB Bar: Mon 8:00 → 7:00
    await updateOne(
        { venueName: 'KGB Bar', day: 'Monday', startTime: '8:00 PM' },
        { startTime: '7:00 PM' },
        'KGB Bar: Mon 8:00 PM → 7:00 PM'
    );

    // Phoenix Bar Avenue A: Thu 6:05 → 6:30
    await updateOne(
        { venueName: 'Phoenix Bar Avenue A', day: 'Thursday', startTime: '6:05 PM' },
        { startTime: '6:30 PM' },
        'Phoenix Bar Avenue A: Thu 6:05 PM → 6:30 PM'
    );

    // Fear City: Tue 8:00 → 9:00
    await updateOne(
        { venueName: { $regex: /fear city/i }, day: 'Tuesday', startTime: '8:00 PM' },
        { startTime: '9:00 PM' },
        'Fear City: Tue 8:00 PM → 9:00 PM'
    );

    // Fear City: Wed 8:00 → 9:00
    await updateOne(
        { venueName: { $regex: /fear city/i }, day: 'Wednesday', startTime: '8:00 PM' },
        { startTime: '9:00 PM' },
        'Fear City: Wed 8:00 PM → 9:00 PM'
    );

    // Fear City: Thu 8:00 → 9:00
    await updateOne(
        { venueName: { $regex: /fear city/i }, day: 'Thursday', startTime: '8:00 PM' },
        { startTime: '9:00 PM' },
        'Fear City: Thu 8:00 PM → 9:00 PM'
    );

    // Rodney's: move Tue 9:45 → Mon 9:45
    await updateOne(
        { venueName: "Rodney's", day: 'Tuesday', startTime: '9:45 PM' },
        { day: 'Monday' },
        "Rodney's: Tue 9:45 PM → Mon 9:45 PM"
    );

    // West Side Comedy Club: remove Wed 5:45, add Tue 6:00
    await deleteOne(
        { venueName: 'West Side Comedy Club', day: 'Wednesday', startTime: '5:45 PM' },
        'West Side Comedy Club: Wed 5:45 PM'
    );

    // Get coords from existing West Side entry
    const wscc = await col.findOne({ venueName: 'West Side Comedy Club' });
    if (wscc) {
        await insertOne({
            name: wscc.name || 'West Side Comedy Club',
            day: 'Tuesday',
            startTime: '6:00 PM',
            endTime: wscc.endTime || null,
            venueName: 'West Side Comedy Club',
            borough: wscc.borough,
            neighborhood: wscc.neighborhood,
            address: wscc.address,
            cost: wscc.cost,
            stageTime: wscc.stageTime,
            signUpDetails: wscc.signUpDetails,
            host: 'Alex Kimedian and Patricia Din',
            notes: wscc.notes || null,
            lat: wscc.lat,
            lon: wscc.lon
        }, 'West Side Comedy Club: Tue 6:00 PM');
    }

    // =============================================
    // 3. SLOT ADDITIONS
    // =============================================
    console.log('\n--- SLOT ADDITIONS ---');

    // Comic Strip Live: add Fri 6:00 PM
    const csl = await col.findOne({ venueName: 'Comic Strip Live' });
    if (csl) {
        await insertOne({
            name: 'Comic Strip Live',
            day: 'Friday',
            startTime: '6:00 PM',
            endTime: null,
            venueName: 'Comic Strip Live',
            borough: csl.borough,
            neighborhood: csl.neighborhood,
            address: csl.address,
            cost: '$7 (free drink)',
            stageTime: csl.stageTime,
            signUpDetails: 'List in person',
            host: '@maybejamespatrick',
            notes: null,
            lat: csl.lat,
            lon: csl.lon
        }, 'Comic Strip Live: Fri 6:00 PM');
    }

    // The Stand: add Mon 5:00 PM, Sat 2:30 PM
    const stand = await col.findOne({ venueName: { $regex: /^The Stand$/i } });
    if (stand) {
        await insertOne({
            name: 'The Stand',
            day: 'Monday',
            startTime: '5:00 PM',
            endTime: null,
            venueName: 'The Stand',
            borough: stand.borough,
            neighborhood: stand.neighborhood,
            address: stand.address,
            cost: '$8 + 1 drink min',
            stageTime: stand.stageTime,
            signUpDetails: 'https://www.laughingbuddhacomedy.com/mics',
            host: '@laughingbuddhacomedy',
            notes: null,
            lat: stand.lat,
            lon: stand.lon
        }, 'The Stand: Mon 5:00 PM');

        await insertOne({
            name: 'The Stand',
            day: 'Saturday',
            startTime: '2:30 PM',
            endTime: null,
            venueName: 'The Stand',
            borough: stand.borough,
            neighborhood: stand.neighborhood,
            address: stand.address,
            cost: '$8 + 1 drink min',
            stageTime: stand.stageTime,
            signUpDetails: 'https://www.laughingbuddhacomedy.com/mics',
            host: '@laughingbuddhacomedy',
            notes: null,
            lat: stand.lat,
            lon: stand.lon
        }, 'The Stand: Sat 2:30 PM');
    }

    // Producer's Club: add Sat 6:00 PM, Sat 7:30 PM
    const pc = await col.findOne({ venueName: "Producer's Club" });
    if (pc) {
        await insertOne({
            name: "Producer's Club",
            day: 'Saturday',
            startTime: '6:00 PM',
            endTime: null,
            venueName: "Producer's Club",
            borough: pc.borough,
            neighborhood: pc.neighborhood,
            address: pc.address,
            cost: pc.cost,
            stageTime: pc.stageTime,
            signUpDetails: pc.signUpDetails,
            host: pc.host,
            notes: null,
            lat: pc.lat,
            lon: pc.lon
        }, "Producer's Club: Sat 6:00 PM");

        await insertOne({
            name: "Producer's Club",
            day: 'Saturday',
            startTime: '7:30 PM',
            endTime: null,
            venueName: "Producer's Club",
            borough: pc.borough,
            neighborhood: pc.neighborhood,
            address: pc.address,
            cost: pc.cost,
            stageTime: pc.stageTime,
            signUpDetails: pc.signUpDetails,
            host: pc.host,
            notes: null,
            lat: pc.lat,
            lon: pc.lon
        }, "Producer's Club: Sat 7:30 PM");
    }

    // The Buddha Room: add many new slots
    const buddha = await col.findOne({ venueName: 'The Buddha Room' });
    if (buddha) {
        const newBuddhaSlots = [
            { day: 'Monday', startTime: '4:00 PM' },
            { day: 'Monday', startTime: '8:00 PM' },
            { day: 'Monday', startTime: '10:00 PM' },
            { day: 'Tuesday', startTime: '5:00 PM' },
            { day: 'Tuesday', startTime: '8:00 PM' },
            { day: 'Tuesday', startTime: '10:00 PM' },
            { day: 'Wednesday', startTime: '4:00 PM' },
            { day: 'Wednesday', startTime: '5:00 PM' },
            { day: 'Thursday', startTime: '4:00 PM' },
            { day: 'Thursday', startTime: '5:00 PM' },
            { day: 'Friday', startTime: '4:00 PM' },
            { day: 'Friday', startTime: '5:00 PM' },
            { day: 'Saturday', startTime: '3:00 PM' },
            { day: 'Saturday', startTime: '10:00 PM' },
            { day: 'Sunday', startTime: '5:00 PM' },
            { day: 'Sunday', startTime: '6:00 PM' },
            { day: 'Sunday', startTime: '7:00 PM' },
            { day: 'Sunday', startTime: '8:00 PM' },
        ];

        for (const slot of newBuddhaSlots) {
            // Check if already exists
            const exists = await col.findOne({
                venueName: 'The Buddha Room',
                day: slot.day,
                startTime: slot.startTime
            });
            if (!exists) {
                await insertOne({
                    name: 'The Buddha Room',
                    day: slot.day,
                    startTime: slot.startTime,
                    endTime: null,
                    venueName: 'The Buddha Room',
                    borough: buddha.borough,
                    neighborhood: buddha.neighborhood,
                    address: buddha.address,
                    cost: '$8 + 1 drink min',
                    stageTime: buddha.stageTime,
                    signUpDetails: 'https://www.laughingbuddhacomedy.com/mics',
                    host: '@laughingbuddhacomedy',
                    notes: null,
                    lat: buddha.lat,
                    lon: buddha.lon
                }, `The Buddha Room: ${slot.day} ${slot.startTime}`);
            }
        }

        // Remove old Buddha Room slots that no longer exist
        const removeBuddhaSlots = [
            { day: 'Monday', startTime: '7:30 PM' },
            { day: 'Wednesday', startTime: '7:30 PM' },
            { day: 'Wednesday', startTime: '9:00 PM' },
            { day: 'Thursday', startTime: '6:00 PM' },
            { day: 'Thursday', startTime: '9:00 PM' },
            { day: 'Friday', startTime: '9:00 PM' },
            { day: 'Saturday', startTime: '5:00 PM' },
        ];

        for (const slot of removeBuddhaSlots) {
            await deleteOne(
                { venueName: 'The Buddha Room', day: slot.day, startTime: slot.startTime },
                `The Buddha Room: ${slot.day} ${slot.startTime}`
            );
        }
    }

    // =============================================
    // 4. SLOT REMOVALS
    // =============================================
    console.log('\n--- SLOT REMOVALS ---');

    await deleteOne(
        { venueName: 'Brooklyn Art Haus', day: 'Tuesday', startTime: '9:00 PM' },
        'Brooklyn Art Haus: Tue 9:00 PM'
    );

    await deleteOne(
        { venueName: 'Fiction Bar', day: 'Wednesday', startTime: '7:00 PM' },
        'Fiction Bar: Wed 7:00 PM'
    );

    // St. Mark's Comedy Club: remove 3 slots
    await deleteOne(
        { venueName: { $regex: /st\.? mark.*comedy club/i }, day: 'Monday', startTime: '7:00 PM' },
        "St. Mark's Comedy Club: Mon 7:00 PM"
    );
    await deleteOne(
        { venueName: { $regex: /st\.? mark.*comedy club/i }, day: 'Sunday', startTime: '5:00 PM' },
        "St. Mark's Comedy Club: Sun 5:00 PM"
    );
    await deleteOne(
        { venueName: { $regex: /st\.? mark.*comedy club/i }, day: 'Tuesday', startTime: '5:00 PM' },
        "St. Mark's Comedy Club: Tue 5:00 PM"
    );

    // The Tiny Cupboard: remove old slots
    const tinyRemove = [
        { day: 'Monday', startTime: '8:30 PM' },
        { day: 'Monday', startTime: '10:00 PM' },
        { day: 'Tuesday', startTime: '8:30 PM' },
        { day: 'Wednesday', startTime: '8:30 PM' },
        { day: 'Wednesday', startTime: '10:00 PM' },
        { day: 'Thursday', startTime: '8:30 PM' },
        { day: 'Thursday', startTime: '10:00 PM' },
        { day: 'Friday', startTime: '8:30 PM' },
        { day: 'Friday', startTime: '10:00 PM' },
        { day: 'Saturday', startTime: '8:30 PM' },
        { day: 'Saturday', startTime: '10:00 PM' },
        { day: 'Sunday', startTime: '8:30 PM' },
        { day: 'Sunday', startTime: '10:00 PM' },
    ];
    for (const slot of tinyRemove) {
        await deleteOne(
            { venueName: 'The Tiny Cupboard', day: slot.day, startTime: slot.startTime },
            `The Tiny Cupboard: ${slot.day} ${slot.startTime}`
        );
    }

    // Add new Tiny Cupboard slots
    const tiny = await col.findOne({ venueName: 'The Tiny Cupboard' });
    if (tiny) {
        const tinyAdd = [
            { day: 'Thursday', startTime: '10:30 PM' },
            { day: 'Friday', startTime: '11:45 PM' },
            { day: 'Saturday', startTime: '11:45 PM' },
        ];
        for (const slot of tinyAdd) {
            const exists = await col.findOne({ venueName: 'The Tiny Cupboard', day: slot.day, startTime: slot.startTime });
            if (!exists) {
                await insertOne({
                    name: 'The Tiny Cupboard',
                    day: slot.day,
                    startTime: slot.startTime,
                    endTime: null,
                    venueName: 'The Tiny Cupboard',
                    borough: tiny.borough,
                    neighborhood: tiny.neighborhood,
                    address: tiny.address,
                    cost: tiny.cost,
                    stageTime: tiny.stageTime,
                    signUpDetails: 'sign up at thetinycupboard.com',
                    host: '@spaandaa @caragh.ab',
                    notes: null,
                    lat: tiny.lat,
                    lon: tiny.lon
                }, `The Tiny Cupboard: ${slot.day} ${slot.startTime}`);
            }
        }
    }

    // Eastville: remove Thu 8:00 PM
    await deleteOne(
        { venueName: 'Eastville Comedy Club', day: 'Thursday', startTime: '8:00 PM' },
        'Eastville Comedy Club: Thu 8:00 PM'
    );

    // =============================================
    // 5. REAL COST CHANGES
    // =============================================
    console.log('\n--- COST CHANGES ---');

    await updateOne(
        { venueName: 'Harlem Nights Bar' },
        { cost: '$5' },
        'Harlem Nights Bar: $7.62 → $5'
    );

    // Comic Strip Live — update existing entry cost too
    await col.updateMany(
        { venueName: 'Comic Strip Live' },
        { $set: { cost: '$7 (free drink)' } }
    );
    console.log('  ✓ Comic Strip Live: cost → $7 (free drink)');
    updated++;

    await updateOne(
        { venueName: 'Eastville Comedy Club', day: { $exists: true } },
        { cost: '1 drink minimum ($10)' },
        'Eastville Comedy Club: cost → 1 drink minimum ($10)'
    );
    // Update all Eastville entries
    await col.updateMany(
        { venueName: 'Eastville Comedy Club' },
        { $set: { cost: '1 drink minimum ($10)' } }
    );

    await col.updateMany(
        { venueName: 'Pioneers Bar' },
        { $set: { cost: '$5 - 5 mins // $7 - 10 mins cash only' } }
    );
    console.log('  ✓ Pioneers Bar: cost → $5 - 5 mins // $7 - 10 mins cash only');
    updated++;

    // =============================================
    // 6. REAL HOST CHANGES
    // =============================================
    console.log('\n--- HOST CHANGES ---');

    await col.updateMany(
        { venueName: 'Comic Strip Live' },
        { $set: { host: '@maybejamespatrick' } }
    );
    console.log('  ✓ Comic Strip Live: host → @maybejamespatrick');
    updated++;

    await col.updateMany(
        { venueName: { $regex: /easy lover/i } },
        { $set: { host: '@allmyproblemz and @suchagreatname (@easylovermics)' } }
    );
    console.log('  ✓ easy lover BK: host updated');
    updated++;

    await col.updateMany(
        { venueName: 'Fiction Bar' },
        { $set: { host: '@SeanPeecook and @Eion_ (@fictionbarcomedy)' } }
    );
    console.log('  ✓ Fiction Bar: host updated');
    updated++;

    await col.updateMany(
        { venueName: 'West Side Comedy Club' },
        { $set: { host: 'Alex Kimedian and Patricia Din' } }
    );
    console.log('  ✓ West Side Comedy Club: host updated');
    updated++;

    // =============================================
    // Clear Redis cache
    // =============================================
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

    // =============================================
    // Summary
    // =============================================
    console.log(`\n${'='.repeat(40)}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Added:   ${added}`);
    console.log(`  Removed: ${removed}`);
    console.log(`  Total changes: ${updated + added + removed}`);
    console.log(`${'='.repeat(40)}\n`);

    await mongoose.disconnect();
}

run().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
