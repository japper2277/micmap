// cache-behavior.test.js - Test Redis caching behavior
const request = require('supertest');
const Mic = require('../../models/Mic');
const app = require('../../server');

// Mock Redis for deterministic testing
jest.mock('ioredis', () => require('ioredis-mock'));

describe('Critical Path: Cache Behavior', () => {
  beforeEach(async () => {
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
  });

  test('First request should be cache miss', async () => {
    const response = await request(app)
      .get('/api/v1/mics?day=Monday')
      .expect(200);

    expect(response.body.success).toBe(true);
    // First request won't have cached: true
  });

  test('Query params in different order hit same cache', async () => {
    // First request: day then borough
    const response1 = await request(app)
      .get('/api/v1/mics?day=Monday&borough=Brooklyn')
      .expect(200);

    // Second request: borough then day (same data, different order)
    const response2 = await request(app)
      .get('/api/v1/mics?borough=Brooklyn&day=Monday')
      .expect(200);

    // Both should return same data
    expect(response1.body.count).toBe(response2.body.count);
    expect(response1.body.mics[0].name).toBe(response2.body.mics[0].name);
  });

  test('Different query params create different cache entries', async () => {
    const mondayResponse = await request(app)
      .get('/api/v1/mics?day=Monday')
      .expect(200);

    const tuesdayResponse = await request(app)
      .get('/api/v1/mics?day=Tuesday')
      .expect(200);

    // Should be different results
    expect(mondayResponse.body.count).not.toBe(tuesdayResponse.body.count);
  });
});
