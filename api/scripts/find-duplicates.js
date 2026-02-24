/**
 * Find duplicate mics in the database
 * Run with: cd api && node scripts/find-duplicates.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const col = mongoose.connection.collection('mics');

    const allMics = await col.find({}).project({
        _id: 1, name: 1, day: 1, startTime: 1,
        venueName: 1, lat: 1, lon: 1, host: 1, cost: 1
    }).toArray();

    console.log('Total mics: ' + allMics.length + '\n');

    // 1. Exact duplicates: same venueName + day + startTime
    console.log('=== EXACT DUPLICATES (same venue + day + time) ===');
    const exactGroups = {};
    for (const m of allMics) {
        const key = m.venueName + '|' + m.day + '|' + m.startTime;
        if (!exactGroups[key]) exactGroups[key] = [];
        exactGroups[key].push(m);
    }

    let exactCount = 0;
    for (const [key, mics] of Object.entries(exactGroups)) {
        if (mics.length > 1) {
            exactCount++;
            console.log('\n' + key.replace(/\|/g, ' | ') + ' (' + mics.length + ' entries):');
            for (const m of mics) {
                console.log('  ' + m._id + ' | ' + m.name + ' | host: ' + m.host + ' | ' + m.cost);
            }
        }
    }
    if (exactCount === 0) console.log('  None found');

    // 2. Near duplicates: same day + time + very close coordinates but different venue name
    console.log('\n=== NEAR DUPLICATES (same day + time, ~same location, different venue name) ===');
    const locGroups = {};
    for (const m of allMics) {
        if (!m.lat || !m.lon) continue;
        const key = m.day + '|' + m.startTime + '|' + m.lat.toFixed(3) + '|' + m.lon.toFixed(3);
        if (!locGroups[key]) locGroups[key] = [];
        locGroups[key].push(m);
    }

    let nearCount = 0;
    for (const [key, mics] of Object.entries(locGroups)) {
        if (mics.length > 1) {
            const venueNames = new Set(mics.map(m => m.venueName));
            if (venueNames.size > 1) {
                nearCount++;
                console.log('\n' + key.replace(/\|/g, ' | ') + ':');
                for (const m of mics) {
                    console.log('  ' + m._id + ' | ' + m.venueName + ' | ' + m.name + ' | host: ' + m.host);
                }
            }
        }
    }
    if (nearCount === 0) console.log('  None found');

    // 3. Same venue name spelled differently (potential merge candidates)
    console.log('\n=== POSSIBLE VENUE NAME VARIANTS (same coords, different name) ===');
    const coordGroups = {};
    for (const m of allMics) {
        if (!m.lat || !m.lon) continue;
        const key = m.lat.toFixed(4) + '|' + m.lon.toFixed(4);
        if (!coordGroups[key]) coordGroups[key] = [];
        coordGroups[key].push(m);
    }

    let variantCount = 0;
    for (const [key, mics] of Object.entries(coordGroups)) {
        const venueNames = new Set(mics.map(m => m.venueName));
        if (venueNames.size > 1) {
            variantCount++;
            console.log('\nCoords ' + key.replace('|', ', ') + ':');
            for (const name of venueNames) {
                const count = mics.filter(m => m.venueName === name).length;
                console.log('  "' + name + '" (' + count + ' mics)');
            }
        }
    }
    if (variantCount === 0) console.log('  None found');

    await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
