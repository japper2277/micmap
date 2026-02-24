// Fix missing addresses in MongoDB
const mongoose = require('mongoose');
require('dotenv').config();

// Define Mic schema (minimal for this script)
const micSchema = new mongoose.Schema({
  name: String,
  venueName: String,
  address: String
}, { collection: 'mics', strict: false });

const Mic = mongoose.model('Mic', micSchema);

// Addresses to add
const addressUpdates = [
  {
    id: '69724078e62d4a0dc7d599d6',
    venueName: 'New York Comedy Club East 4th',
    address: '85 E 4th St, New York, NY 10003'
  },
  {
    id: '69724078e62d4a0dc7d599d7',
    venueName: 'New York Comedy Club 24th St',
    address: '241 E 24th St, New York, NY 10010'
  }
];

async function fixAddresses() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const update of addressUpdates) {
      const result = await Mic.updateOne(
        { _id: update.id },
        { $set: { address: update.address } }
      );

      if (result.modifiedCount > 0) {
        console.log(`Updated "${update.venueName}" with address: ${update.address}`);
      } else {
        console.log(`No changes for "${update.venueName}" (may already be set or ID not found)`);
      }
    }

    // Verify the updates
    console.log('\nVerifying updates:');
    for (const update of addressUpdates) {
      const mic = await Mic.findById(update.id);
      if (mic) {
        console.log(`  ${mic.venueName}: ${mic.address || '(still empty)'}`);
      }
    }

    console.log('\nDone!');
  } finally {
    await mongoose.disconnect();
  }
}

fixAddresses().catch(console.error);
