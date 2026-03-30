const request = require('supertest');

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_ENABLE_FB_WEBHOOK = process.env.ENABLE_FB_WEBHOOK;
const ORIGINAL_MICMAP_ADMIN_TOKEN = process.env.MICMAP_ADMIN_TOKEN;

function loadServer() {
  return require('../../server');
}

describe('Integration: FB webhook gating', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    jest.unmock('../../config/database');
    jest.unmock('../../services/fb-webhook');

    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_ENABLE_FB_WEBHOOK === undefined) {
      delete process.env.ENABLE_FB_WEBHOOK;
    } else {
      process.env.ENABLE_FB_WEBHOOK = ORIGINAL_ENABLE_FB_WEBHOOK;
    }
    if (ORIGINAL_MICMAP_ADMIN_TOKEN === undefined) {
      delete process.env.MICMAP_ADMIN_TOKEN;
    } else {
      process.env.MICMAP_ADMIN_TOKEN = ORIGINAL_MICMAP_ADMIN_TOKEN;
    }
  });

  test('FB webhook routes fall through to 404 when feature flag is off', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ENABLE_FB_WEBHOOK;

    const app = loadServer();

    const reviewResponse = await request(app)
      .get('/admin/fb-review-queue')
      .expect(404);

    const postResponse = await request(app)
      .post('/admin/fb-group-post')
      .send({ text: 'test post' })
      .expect(404);

    const applyResponse = await request(app)
      .post('/admin/fb-apply')
      .send({ matchedMicId: '123' })
      .expect(404);

    expect(reviewResponse.body.error).toBe('Endpoint not found');
    expect(postResponse.body.error).toBe('Endpoint not found');
    expect(applyResponse.body.error).toBe('Endpoint not found');
  });

  test('FB webhook routes register when feature flag is on', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ENABLE_FB_WEBHOOK = 'true';
    process.env.MICMAP_ADMIN_TOKEN = 'test-admin-token';

    jest.doMock('../../services/fb-webhook', () => ({
      processPost: jest.fn(),
      getReviewQueue: jest.fn().mockResolvedValue([]),
      applyEntry: jest.fn()
    }));

    const app = loadServer();

    const reviewResponse = await request(app)
      .get('/admin/fb-review-queue')
      .set('x-admin-token', 'test-admin-token')
      .expect(200);

    const postResponse = await request(app)
      .post('/admin/fb-group-post')
      .set('x-admin-token', 'test-admin-token')
      .send({})
      .expect(400);

    const applyResponse = await request(app)
      .post('/admin/fb-apply')
      .set('x-admin-token', 'test-admin-token')
      .send({})
      .expect(400);

    expect(reviewResponse.body).toMatchObject({ success: true, count: 0, items: [] });
    expect(postResponse.body.error).toBe('Payload must include text or images');
    expect(applyResponse.body.error).toBe('Payload must include matchedMicId');
  });

  test('protected admin routes reject missing or bad admin tokens', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ENABLE_FB_WEBHOOK = 'true';
    process.env.MICMAP_ADMIN_TOKEN = 'test-admin-token';

    jest.doMock('../../services/fb-webhook', () => ({
      processPost: jest.fn(),
      getReviewQueue: jest.fn().mockResolvedValue([]),
      applyEntry: jest.fn()
    }));

    const app = loadServer();

    const missingTokenResponse = await request(app)
      .get('/admin/fb-review-queue')
      .expect(401);

    const badTokenResponse = await request(app)
      .get('/admin/fb-review-queue')
      .set('x-admin-token', 'wrong-token')
      .expect(401);

    const lbCompareMissingToken = await request(app)
      .get('/api/v1/admin/lb-compare/latest')
      .expect(401);

    const lbCompareAuthorized = await request(app)
      .get('/api/v1/admin/lb-compare/latest')
      .set('x-admin-token', 'test-admin-token')
      .expect(200);

    expect(missingTokenResponse.body.error).toBe('Unauthorized');
    expect(badTokenResponse.body.error).toBe('Unauthorized');
    expect(lbCompareMissingToken.body.error).toBe('Unauthorized');
    expect(lbCompareAuthorized.body.success).toBe(true);
  });

  test('production startup skips FB webhook bootstrap when feature flag is off', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_FB_WEBHOOK;

    jest.doMock('../../config/database', () => ({
      connectDB: jest.fn()
    }));

    jest.doMock('../../services/fb-webhook', () => {
      throw new Error('FB webhook should not load when disabled');
    });

    const express = require('express');
    const listenSpy = jest.spyOn(express.application, 'listen').mockImplementation(() => ({ close: jest.fn() }));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    loadServer();

    const fbWarnings = warnSpy.mock.calls.filter(([message]) =>
      String(message).includes('FB webhook service not available')
    );

    expect(fbWarnings).toHaveLength(0);
    expect(listenSpy).toHaveBeenCalled();
  });
});
