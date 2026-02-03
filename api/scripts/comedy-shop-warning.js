// Add warning to Comedy Shop - remove mic details but keep one entry per day
const mongoose = require('mongoose');
require('dotenv').config();

const micSchema = new mongoose.Schema({
  name: String,
  day: String,
  startTime: String,
  endTime: String,
  venueName: String,
  borough: String,
  neighborhood: String,
  address: String,
  lat: Number,
  lon: Number,
  cost: String,
  stageTime: String,
  signUpDetails: String,
  host: String,
  notes: String,
  warning: String
}, { collection: 'mics', strict: false });

const Mic = mongoose.model('Mic', micSchema);

const WARNING_TEXT = 'Multiple women have alleged sexual harassment by this venue\'s owner';
const WARNING_LINK = 'https://www.instagram.com/p/DUPKOE_EaCE/';

async function updateComedyShop() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all Comedy Shop entries
    const comedyShopMics = await Mic.find({
      venueName: { $regex: /comedy shop/i }
    });

    console.log(`Found ${comedyShopMics.length} Comedy Shop entries`);

    if (comedyShopMics.length === 0) {
      console.log('No Comedy Shop entries found');
      return;
    }

    // Get unique days and keep one entry per day
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const keptIds = [];

    for (const day of days) {
      const entry = comedyShopMics.find(m => m.day === day);
      if (entry) {
        keptIds.push(entry._id);
      }
    }

    // Delete extras (keep only one per day)
    const deleteIds = comedyShopMics
      .filter(m => !keptIds.includes(m._id))
      .map(m => m._id);

    if (deleteIds.length > 0) {
      const deleteResult = await Mic.deleteMany({ _id: { $in: deleteIds } });
      console.log(`Deleted ${deleteResult.deletedCount} duplicate entries`);
    }

    // Update remaining entries with warning, clear mic-specific data
    const updateResult = await Mic.updateMany(
      { _id: { $in: keptIds } },
      {
        $set: {
          name: 'Comedy Shop',
          startTime: null,
          endTime: null,
          cost: null,
          stageTime: null,
          signUpDetails: null,
          host: null,
          notes: null,
          warning: WARNING_TEXT,
          warningLink: WARNING_LINK
        }
      }
    );

    console.log(`Updated ${updateResult.modifiedCount} entries with warning`);

    // Verify
    const updated = await Mic.find({ venueName: { $regex: /comedy shop/i } });
    console.log(`\n${updated.length} Comedy Shop entries now:`);
    updated.forEach(m => {
      console.log(`  ${m.day}: warning="${m.warning ? 'YES' : 'NO'}"`);
    });

    console.log('\nDone!');
  } finally {
    await mongoose.disconnect();
  }
}

updateComedyShop().catch(console.error);
