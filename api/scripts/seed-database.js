// Update approved seed records while preserving IDs used by saved plans.
const fs = require('fs');
const path = require('path');
const { planSeed } = require('./seed-plan');
async function seed() {
  const mongoose = require('mongoose');
  let redis;
  try {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI environment variable is required');
    const incoming = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'mics.json'), 'utf8'));
    await mongoose.connect(process.env.MONGODB_URI);
    const collection = mongoose.connection.collection('mics');
    const existing = await collection.find({}).toArray();
    // Validate everything before the first write. Missing/ambiguous identities stop the run.
    const operations = planSeed(incoming, existing);
    await collection.bulkWrite(operations, { ordered: true });
    console.log(`Synchronized ${operations.length} records; existing IDs preserved`);
    if (process.env.REDIS_URL) {
      const Redis = require('ioredis');
      redis = new Redis(process.env.REDIS_URL);
      let cursor = '0';
      do {
        const page = await redis.scan(cursor, 'MATCH', 'micmap:mics:*', 'COUNT', 100);
        cursor = page[0];
        if (page[1].length) await redis.del(...page[1]);
      } while (cursor !== '0');
    }
  } finally {
    if (redis) await redis.quit();
    await mongoose.disconnect();
  }
}
if (require.main === module) seed().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { seed };
