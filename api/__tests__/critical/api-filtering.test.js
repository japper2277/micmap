// api-filtering.test.js - Test API filtering functionality
const request = require('supertest');
const Mic = require('../../models/Mic');
const app = require('../../server');

describe('Critical Path: API Filtering', () => {
  beforeEach(async () => {
    // Create test mics with different attributes
    await Mic.create([
      {
        name: 'Monday Brooklyn Mic',
        day: 'Monday',
        startTime: '7:00 PM',
        venueName: 'Brooklyn Venue',
        borough: 'Brooklyn',
        neighborhood: 'Williamsburg',
        address: '123 Test St',
        lat: 40.7,
        lon: -73.9,
        cost: 'Free'
      },
      {
        name: 'Monday Manhattan Mic',
        day: 'Monday',
        startTime: '8:00 PM',
        venueName: 'Manhattan Venue',
        borough: 'Manhattan',
        neighborhood: 'East Village',
        address: '456 Test Ave',
        lat: 40.72,
        lon: -73.98,
        cost: '$5'
      },
      {
        name: 'Tuesday Brooklyn Mic',
        day: 'Tuesday',
        startTime: '7:00 PM',
        venueName: 'Brooklyn Venue 2',
        borough: 'Brooklyn',
        neighborhood: 'Bushwick',
        address: '789 Test Blvd',
        lat: 40.71,
        lon: -73.92,
        cost: 'Free'
      }
    ]);
  });

  test('Filter by day returns only mics on that day', async () => {
    const response = await request(app)
      .get('/api/v1/mics?day=Monday')
      .expect(200);

    expect(response.body.count).toBe(2);
    response.body.mics.forEach(mic => {
      expect(mic.day).toBe('Monday');
    });
  });

  test('Filter by borough returns only mics in that borough', async () => {
    const response = await request(app)
      .get('/api/v1/mics?borough=Brooklyn')
      .expect(200);

    expect(response.body.count).toBe(2);
    response.body.mics.forEach(mic => {
      expect(mic.borough).toBe('Brooklyn');
    });
  });

  test('Filter by day AND borough (multiple filters)', async () => {
    const response = await request(app)
      .get('/api/v1/mics?day=Monday&borough=Brooklyn')
      .expect(200);

    expect(response.body.count).toBe(1);
    expect(response.body.mics[0].name).toBe('Monday Brooklyn Mic');
    expect(response.body.mics[0].day).toBe('Monday');
    expect(response.body.mics[0].borough).toBe('Brooklyn');
  });

  test('Filter by cost (free)', async () => {
    const response = await request(app)
      .get('/api/v1/mics?cost=free')
      .expect(200);

    expect(response.body.count).toBe(2);
    response.body.mics.forEach(mic => {
      expect(mic.cost.toLowerCase()).toContain('free');
    });
  });

  test('Filter with no matches returns empty array', async () => {
    const response = await request(app)
      .get('/api/v1/mics?day=Wednesday')
      .expect(200);

    expect(response.body.count).toBe(0);
    expect(response.body.mics).toEqual([]);
  });

  test('Filter by neighborhood', async () => {
    const response = await request(app)
      .get('/api/v1/mics?neighborhood=Williamsburg')
      .expect(200);

    expect(response.body.count).toBe(1);
    expect(response.body.mics[0].neighborhood).toBe('Williamsburg');
  });
});
