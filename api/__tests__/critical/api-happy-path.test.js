// api-happy-path.test.js - Test basic API functionality
const request = require('supertest');
const Mic = require('../../models/Mic');

// Import app but don't start server (supertest handles that)
const app = require('../../server');

describe('Critical Path: API Happy Path', () => {
  // Seed test data before tests
  beforeEach(async () => {
    await Mic.create([
      {
        name: 'Test Mic Monday',
        day: 'Monday',
        startTime: '7:00 PM',
        venueName: 'Test Venue',
        borough: 'Brooklyn',
        neighborhood: 'Williamsburg',
        address: '123 Test St',
        lat: 40.7,
        lon: -73.9,
        cost: 'Free'
      },
      {
        name: 'Test Mic Tuesday',
        day: 'Tuesday',
        startTime: '8:00 PM',
        venueName: 'Test Venue 2',
        borough: 'Manhattan',
        neighborhood: 'East Village',
        address: '456 Test Ave',
        lat: 40.72,
        lon: -73.98,
        cost: '$5'
      }
    ]);
  });

  test('GET /api/v1/mics returns all mics', async () => {
    const response = await request(app)
      .get('/api/v1/mics')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.count).toBe(2);
    expect(response.body.mics).toHaveLength(2);
    expect(response.body.mics[0]).toHaveProperty('name');
    expect(response.body.mics[0]).toHaveProperty('day');
    expect(response.body.mics[0]).toHaveProperty('venueName');
  });

  test('Response includes required fields', async () => {
    const response = await request(app)
      .get('/api/v1/mics')
      .expect(200);

    const mic = response.body.mics[0];

    // Check all required fields exist
    expect(mic).toHaveProperty('name');
    expect(mic).toHaveProperty('day');
    expect(mic).toHaveProperty('startTime');
    expect(mic).toHaveProperty('venueName');
    expect(mic).toHaveProperty('borough');
    expect(mic).toHaveProperty('lat');
    expect(mic).toHaveProperty('lon');
    expect(mic).toHaveProperty('cost');
  });

  test('Response includes X-Request-ID header', async () => {
    const response = await request(app)
      .get('/api/v1/mics')
      .expect(200);

    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.headers['x-request-id']).toMatch(/^[a-f0-9]{16}$/);
  });

  test('Response includes CORS headers', async () => {
    const response = await request(app)
      .get('/api/v1/mics')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('*');
  });
});
