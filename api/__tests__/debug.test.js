// debug.test.js - Debug test to understand database state
const request = require('supertest');
const mongoose = require('mongoose');
const Mic = require('../models/Mic');
const app = require('../server');

describe('Debug: Database State', () => {
  test('Check MongoDB connection', async () => {
    console.log('MongoDB URI:', process.env.MONGODB_URI);
    console.log('Connection state:', mongoose.connection.readyState);
    console.log('Database name:', mongoose.connection.name);

    const count = await Mic.countDocuments();
    console.log('Total mics in DB:', count);

    expect(mongoose.connection.readyState).toBe(1); // Connected
  });

  test('Create and retrieve mic', async () => {
    // Create a mic
    await Mic.create({
      name: 'Debug Mic',
      day: 'Monday',
      startTime: '7:00 PM',
      venueName: 'Debug Venue',
      borough: 'Brooklyn',
      lat: 40.7,
      lon: -73.9,
      cost: 'Free'
    });

    const count = await Mic.countDocuments();
    console.log('Mics after create:', count);

    const mics = await Mic.find({});
    console.log('Mic names:', mics.map(m => m.name));

    expect(count).toBe(1);
  });

  test('API returns created mic', async () => {
    // Clear first
    await Mic.deleteMany({});

    // Create test data
    await Mic.create({
      name: 'API Test Mic',
      day: 'Tuesday',
      startTime: '8:00 PM',
      venueName: 'API Venue',
      borough: 'Manhattan',
      lat: 40.72,
      lon: -73.98,
      cost: '$5'
    });

    const response = await request(app)
      .get('/api/v1/mics')
      .expect(200);

    console.log('API response:', JSON.stringify(response.body, null, 2));

    expect(response.body.count).toBe(1);
    expect(response.body.mics[0].name).toBe('API Test Mic');
  });
});
