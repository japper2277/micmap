const mongoose = require('mongoose');
require('dotenv').config();

const micSchema = new mongoose.Schema({}, { strict: false });
const Mic = mongoose.model('Mic', micSchema, 'mics');

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const result = await Mic.updateMany(
    { venueName: { $regex: /rodney/i } },
    { $set: { address: '1118 1st Ave, New York, NY 10065' } }
  );

  console.log('Updated:', result.modifiedCount, 'documents');
  await mongoose.disconnect();
}

fix().catch(console.error);
