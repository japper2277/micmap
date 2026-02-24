/**
 * Clean up duplicate mics and normalize venue names
 * Run with: cd api && node scripts/cleanup-duplicates.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    const col = mongoose.connection.collection('mics');
    let fixed = 0;
    let deleted = 0;

    // =============================================
    // 1. REMOVE NEAR-DUPLICATE MICS
    // =============================================
    console.log('--- REMOVING DUPLICATES ---');

    // The Stand: Mon 5:00 PM has two entries — keep older, delete newer
    const standDupe = await col.deleteOne({ _id: new mongoose.Types.ObjectId('698bafcd0a4407433a6c2c32') });
    if (standDupe.deletedCount) { console.log('  ✓ Removed duplicate: The Stand Mon 5:00 PM'); deleted++; }
    else { console.log('  ✗ The Stand Mon 5:00 PM dupe — not found'); }

    // Rodney's Comedy Club: Mon 9:45 PM duplicate of Rodney's Mon 9:45 PM
    const rodneyDupe = await col.deleteOne({ _id: new mongoose.Types.ObjectId('69724078e62d4a0dc7d59a26') });
    if (rodneyDupe.deletedCount) { console.log('  ✓ Removed duplicate: Rodney\'s Comedy Club Mon 9:45 PM'); deleted++; }
    else { console.log('  ✗ Rodney\'s Comedy Club Mon 9:45 PM dupe — not found'); }

    // =============================================
    // 2. FIX ST. MARK'S WRONG COORDINATES
    // =============================================
    console.log('\n--- FIX COORDINATES ---');

    const stMarksResult = await col.updateOne(
        { _id: new mongoose.Types.ObjectId('69724078e62d4a0dc7d59a58') },
        { $set: { lat: 40.7291, lon: -73.9897, venueName: "St. Marks Comedy Club", borough: 'Manhattan', neighborhood: 'East Village' } }
    );
    if (stMarksResult.modifiedCount) { console.log("  ✓ Fixed St. Mark's Wed 5PM coords → East Village"); fixed++; }

    // =============================================
    // 3. NORMALIZE VENUE NAMES
    // =============================================
    console.log('\n--- NORMALIZING VENUE NAMES ---');

    const renames = [
        { from: /^The Comic Strip Live$/i, to: 'Comic Strip Live' },
        { from: /^easy lover bk$/i, to: 'Easy Lover BK' },
        { from: /^pete's candy store$/i, to: "Pete's Candy Store" },
        { from: /^flop house comedy club$/i, to: 'Flop House Comedy Club' },
        { from: /^Rodney's Comedy Club$/,  to: "Rodney's" },
        { from: /^The Stand NYC$/,         to: 'The Stand' },
        { from: /^Pinebox$/i,              to: 'Pine Box Rock Shop' },
        { from: /^Pine Box$/i,             to: 'Pine Box Rock Shop' },
        { from: /^Gutter Bar$/i,           to: 'The Gutter Williamsburg' },
        { from: /^Freddy's$/,              to: "Freddy's Bar" },
        { from: /^Cobra Club Brooklyn$/i,  to: 'Cobra Club' },
        { from: /^Grove34$/,               to: 'Grove 34' },
        { from: /^alligator lounge$/i,     to: 'Alligator Lounge' },
        { from: /^St\. Mark's Comedy Club$/, to: "St. Marks Comedy Club" },
    ];

    for (const r of renames) {
        const result = await col.updateMany(
            { venueName: r.from },
            { $set: { venueName: r.to } }
        );
        if (result.modifiedCount > 0) {
            console.log('  ✓ ' + r.from.source + ' → "' + r.to + '" (' + result.modifiedCount + ')');
            fixed += result.modifiedCount;
        }
    }

    // Also normalize the "name" field to match venueName where it was a venue name variant
    const nameRenames = [
        { from: /^The Stand NYC$/i, to: 'The Stand' },
        { from: /^The Comic Strip Live$/i, to: 'Comic Strip Live' },
    ];
    for (const r of nameRenames) {
        const result = await col.updateMany(
            { name: r.from },
            { $set: { name: r.to } }
        );
        if (result.modifiedCount > 0) {
            console.log('  ✓ name field: ' + r.from.source + ' → "' + r.to + '" (' + result.modifiedCount + ')');
            fixed += result.modifiedCount;
        }
    }

    // =============================================
    // Clear Redis cache
    // =============================================
    try {
        const Redis = require('ioredis');
        const redis = new Redis(process.env.REDIS_URL);
        const keys = await redis.keys('micmap:mics:*');
        if (keys.length > 0) await redis.del(...keys);
        console.log('\nCleared ' + keys.length + ' Redis cache entries');
        await redis.quit();
    } catch (e) {
        console.log('\nRedis cache clear skipped');
    }

    console.log('\n' + '='.repeat(35));
    console.log('  Fixed:   ' + fixed);
    console.log('  Deleted: ' + deleted);
    console.log('='.repeat(35) + '\n');

    await mongoose.disconnect();
}

run().catch(err => { console.error('Error:', err); process.exit(1); });
