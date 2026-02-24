/**
 * Diff updated mic data against current DB — READ ONLY, no changes
 *
 * Run with: cd api && node scripts/diff-mics.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const NYC_BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];

function normalize(s) { return (s || '').toLowerCase().trim(); }

async function run() {
    // 1. Load new data
    const raw = require('../mics-updated-2-10.json');
    const allMics = Array.isArray(raw) ? raw : (raw.mics || []);
    const nycActive = allMics.filter(m => m.active === true && NYC_BOROUGHS.includes(m.borough));

    // 2. Load current DB
    await mongoose.connect(MONGODB_URI);
    const Mic = require('../models/Mic');
    const dbMics = await Mic.find().lean();
    await mongoose.disconnect();

    // 3. Group by venue name
    const newByVenue = {};
    nycActive.forEach(m => {
        const key = normalize(m.venue_name);
        if (!newByVenue[key]) newByVenue[key] = [];
        newByVenue[key].push(m);
    });

    const dbByVenue = {};
    dbMics.forEach(m => {
        const key = normalize(m.venueName);
        if (!dbByVenue[key]) dbByVenue[key] = [];
        dbByVenue[key].push(m);
    });

    const allVenues = new Set([...Object.keys(newByVenue), ...Object.keys(dbByVenue)]);

    // 4. Categorize
    const newVenues = [];
    const removedVenues = [];
    const changedVenues = [];
    const unchangedVenues = [];

    for (const venue of allVenues) {
        const inNew = newByVenue[venue];
        const inDb = dbByVenue[venue];

        if (inNew && !inDb) {
            newVenues.push({ name: inNew[0].venue_name, count: inNew.length, borough: inNew[0].borough });
        } else if (!inNew && inDb) {
            removedVenues.push({ name: inDb[0].venueName, count: inDb.length, borough: inDb[0].borough });
        } else {
            // Both exist — check for differences
            const newSlots = inNew.map(m => `${m.day}|${m.start_time}`).sort();
            const dbSlots = inDb.map(m => `${m.day}|${m.startTime}`).sort();

            const addedSlots = newSlots.filter(s => !dbSlots.includes(s));
            const removedSlots = dbSlots.filter(s => !newSlots.includes(s));

            // Check for field differences
            const fieldChanges = [];
            const sampleNew = inNew[0];
            const sampleDb = inDb[0];

            if (normalize(sampleNew.cost || 'Free') !== normalize(sampleDb.cost || 'Free')) {
                fieldChanges.push(`cost: "${sampleDb.cost}" → "${sampleNew.cost}"`);
            }
            if (normalize(sampleNew.sign_up_instructions || '') !== normalize(sampleDb.signUpDetails || '')) {
                fieldChanges.push(`signup: "${(sampleDb.signUpDetails || '').slice(0, 40)}" → "${(sampleNew.sign_up_instructions || '').slice(0, 40)}"`);
            }
            if (normalize(sampleNew.hosts_organizers || '') !== normalize(sampleDb.host || '')) {
                fieldChanges.push(`host: "${(sampleDb.host || '').slice(0, 30)}" → "${(sampleNew.hosts_organizers || '').slice(0, 30)}"`);
            }

            if (addedSlots.length > 0 || removedSlots.length > 0 || fieldChanges.length > 0) {
                changedVenues.push({
                    name: inNew[0].venue_name,
                    borough: inNew[0].borough,
                    dbCount: inDb.length,
                    newCount: inNew.length,
                    addedSlots,
                    removedSlots,
                    fieldChanges
                });
            } else {
                unchangedVenues.push({ name: inNew[0].venue_name, count: inNew.length });
            }
        }
    }

    // 5. Print report
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  MIC DATA DIFF REPORT`);
    console.log(`  Current DB: ${dbMics.length} mics | New data: ${nycActive.length} mics`);
    console.log(`${'='.repeat(60)}`);

    console.log(`\n--- NEW VENUES (${newVenues.length}) ---`);
    newVenues.sort((a, b) => a.name.localeCompare(b.name)).forEach(v => {
        console.log(`  + ${v.name} (${v.borough}) — ${v.count} time slots`);
    });

    console.log(`\n--- REMOVED VENUES (${removedVenues.length}) ---`);
    console.log(`  (In current DB but NOT in new data)`);
    removedVenues.sort((a, b) => a.name.localeCompare(b.name)).forEach(v => {
        console.log(`  - ${v.name} (${v.borough}) — ${v.count} time slots`);
    });

    console.log(`\n--- CHANGED VENUES (${changedVenues.length}) ---`);
    changedVenues.sort((a, b) => a.name.localeCompare(b.name)).forEach(v => {
        console.log(`\n  ~ ${v.name} (${v.borough}) — ${v.dbCount} → ${v.newCount} slots`);
        if (v.addedSlots.length) console.log(`    Added: ${v.addedSlots.join(', ')}`);
        if (v.removedSlots.length) console.log(`    Removed: ${v.removedSlots.join(', ')}`);
        v.fieldChanges.forEach(fc => console.log(`    ${fc}`));
    });

    console.log(`\n--- UNCHANGED (${unchangedVenues.length}) ---`);
    unchangedVenues.forEach(v => console.log(`  = ${v.name} (${v.count} slots)`));

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Summary:`);
    console.log(`    New venues:     ${newVenues.length}`);
    console.log(`    Removed venues: ${removedVenues.length}`);
    console.log(`    Changed venues: ${changedVenues.length}`);
    console.log(`    Unchanged:      ${unchangedVenues.length}`);
    console.log(`${'='.repeat(60)}\n`);
}

run().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
