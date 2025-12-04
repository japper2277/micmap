// error-scenarios.test.js - Test error handling
const request = require('supertest');
const mongoose = require('mongoose');
const Mic = require('../../models/Mic');
const app = require('../../server');

describe('Critical Path: Error Scenarios', () => {
  test('404 for unknown endpoint', async () => {
    const response = await request(app)
      .get('/api/v1/nonexistent')
      .expect(404);

    expect(response.body.error).toBeDefined();
  });

  test('Handles MongoDB disconnection gracefully', async () => {
    // Close MongoDB connection to simulate failure
    await mongoose.connection.close();

    const response = await request(app)
      .get('/api/v1/mics')
      .expect(500);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Failed to fetch');

    // Reconnect for other tests
    await mongoose.connect(process.env.MONGODB_URI);
  });

  test('Health check shows unhealthy when MongoDB is down', async () => {
    // Close connection
    await mongoose.connection.close();

    const response = await request(app)
      .get('/health/deep');

    expect(response.status).toBeGreaterThanOrEqual(207); // 207 or 503
    expect(response.body.services.mongodb.status).toBe('unhealthy');

    // Reconnect
    await mongoose.connect(process.env.MONGODB_URI);
  });

  test('Returns empty array for invalid filter values', async () => {
    await Mic.create({
      name: 'Test Mic',
      day: 'Monday',
      startTime: '7:00 PM',
      venueName: 'Test Venue',
      borough: 'Brooklyn',
      lat: 40.7,
      lon: -73.9,
      cost: 'Free'
    });

    const response = await request(app)
      .get('/api/v1/mics?borough=InvalidBorough')
      .expect(200);

    expect(response.body.count).toBe(0);
    expect(response.body.mics).toEqual([]);
  });
});
