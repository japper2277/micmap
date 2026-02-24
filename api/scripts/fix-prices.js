// Fix price data issues in MongoDB
const mongoose = require('mongoose');
require('dotenv').config();

// Define Mic schema (minimal for this script)
const micSchema = new mongoose.Schema({
  name: String,
  cost: String
}, { collection: 'mics', strict: false });

const Mic = mongoose.model('Mic', micSchema);

async function fixPrices() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Fix "$5. (NO CASH)" -> "$5 (NO CASH)"
    const bushwickResult = await Mic.updateMany(
      { cost: "$5. (NO CASH)" },
      { $set: { cost: "$5 (NO CASH)" } }
    );
    console.log(`Fixed Bushwick Comedy Club prices: ${bushwickResult.modifiedCount} records`);

    // Fix prices with \r\n
    const withNewlines = await Mic.find({
      cost: { $regex: /[\r\n]/ }
    });

    for (const mic of withNewlines) {
      const cleanCost = mic.cost.replace(/[\r\n]+/g, '').trim();
      await Mic.updateOne(
        { _id: mic._id },
        { $set: { cost: cleanCost } }
      );
      console.log(`Fixed "${mic.name}": "${mic.cost.replace(/[\r\n]/g, '\\n')}" -> "${cleanCost}"`);
    }

    console.log(`\nFixed ${withNewlines.length} records with newlines`);
    console.log('Done!');

  } finally {
    await mongoose.disconnect();
  }
}

fixPrices().catch(console.error);
