// api-happy-path.test.js - Test basic API functionality
const request = require('supertest');
const Mic = require('../../models/Mic');

// Import app but don't start server (supertest handles that)
const app = require('../../server');
const ORIGINAL_GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

function binaryParser(res, callback) {
  const data = [];
  res.on('data', (chunk) => data.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(data)));
}

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

  afterEach(() => {
    jest.restoreAllMocks();
    if (ORIGINAL_GOOGLE_MAPS_API_KEY === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = ORIGINAL_GOOGLE_MAPS_API_KEY;
    }
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

  test('Response includes allowlisted CORS headers for approved origins', async () => {
    const response = await request(app)
      .get('/api/v1/mics')
      .set('Origin', 'https://micfinder.io')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('https://micfinder.io');
  });

  test('Response includes CORS headers for null origin contexts', async () => {
    const response = await request(app)
      .get('/api/v1/mics')
      .set('Origin', 'null')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('null');
  });

  test('Response disables downstream caching for fresh mic data', async () => {
    const response = await request(app)
      .get('/api/v1/mics')
      .expect(200);

    expect(response.headers['cache-control']).toBe(
      'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0'
    );
    expect(response.headers.pragma).toBe('no-cache');
    expect(response.headers.expires).toBe('0');
  });

  test('Response omits CORS allow header for disallowed origins', async () => {
    const response = await request(app)
      .get('/api/v1/mics')
      .set('Origin', 'https://evil.example.com')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('GET /api/static-map proxies marker requests without redirecting', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
    const imageBytes = Uint8Array.from([137, 80, 78, 71]).buffer;
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: {
        get(name) {
          const normalized = String(name || '').toLowerCase();
          if (normalized === 'content-type') return 'image/png';
          if (normalized === 'cache-control') return 'public, max-age=600';
          return null;
        }
      },
      arrayBuffer: async () => imageBytes
    });

    const response = await request(app)
      .get('/api/static-map')
      .query({
        markers: '40.71,-73.95|40.72,-73.98',
        w: 1200,
        h: 630
      })
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const upstreamUrl = new URL(fetchSpy.mock.calls[0][0]);
    expect(upstreamUrl.origin).toBe('https://maps.googleapis.com');
    expect(upstreamUrl.searchParams.get('markers')).toBe('40.71,-73.95|40.72,-73.98');
    expect(upstreamUrl.searchParams.get('size')).toBe('1200x630');
    expect(upstreamUrl.searchParams.get('key')).toBe('test-google-key');
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers.location).toBeUndefined();
    expect(response.body.equals(Buffer.from(imageBytes))).toBe(true);
  });

  test('GET /api/static-map rejects malformed coordinates before fetching upstream', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
    const fetchSpy = jest.spyOn(global, 'fetch');

    const response = await request(app)
      .get('/api/static-map')
      .query({ lat: 'not-a-number', lng: '-73.95' })
      .expect(400);

    expect(response.body.error).toMatch(/lat must be a finite number/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
