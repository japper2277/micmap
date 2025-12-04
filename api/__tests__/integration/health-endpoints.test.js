// health-endpoints.test.js - Test health check endpoints
const request = require('supertest');
const Mic = require('../../models/Mic');
const app = require('../../server');

describe('Integration: Health Endpoints', () => {
  beforeEach(async () => {
    // Seed some data for health checks
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

  test('GET /health returns healthy status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('healthy');
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.uptime).toBeGreaterThan(0);
  });

  test('GET /health/deep returns detailed health status', async () => {
    const response = await request(app)
      .get('/health/deep')
      .expect(200);

    expect(response.body.status).toBe('healthy');
    expect(response.body.services).toBeDefined();
    expect(response.body.services.mongodb).toBeDefined();
    expect(response.body.services.mongodb.status).toBe('healthy');
    expect(response.body.services.mongodb.connected).toBe(true);
    expect(response.body.services.mongodb.totalMics).toBeGreaterThanOrEqual(1);
  });

  test('GET /health/deep includes response time', async () => {
    const response = await request(app)
      .get('/health/deep')
      .expect(200);

    expect(response.body.responseTime).toBeDefined();
    expect(response.body.responseTime).toBeGreaterThan(0);
    expect(response.body.services.mongodb.responseTime).toBeDefined();
  });

  test('GET /health/deep checks Redis status', async () => {
    const response = await request(app)
      .get('/health/deep')
      .expect(200);

    expect(response.body.services.redis).toBeDefined();
    expect(response.body.services.redis.status).toBeDefined();
  });
});
