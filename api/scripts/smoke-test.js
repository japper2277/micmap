#!/usr/bin/env node
// smoke-test.js - Post-deployment smoke tests

const https = require('https');
const http = require('http');

const BASE_URL = process.argv[2] || 'http://localhost:3001';

console.log(`🧪 Running smoke tests on ${BASE_URL}\n`);

let testsPassed = 0;
let testsFailed = 0;

async function runTests() {
  // Test 1: Health check
  await test('Health check', `${BASE_URL}/health`, (data) => {
    return data.status === 'healthy';
  });

  // Test 2: Deep health check
  await test('Deep health check', `${BASE_URL}/health/deep`, (data) => {
    return data.status === 'healthy' || data.status === 'degraded';
  });

  // Test 3: API returns data
  await test('API returns mics', `${BASE_URL}/api/v1/mics`, (data) => {
    return data.success === true && Array.isArray(data.mics);
  });

  // Test 4: Filtering works
  await test('Filter by day', `${BASE_URL}/api/v1/mics?day=Monday`, (data) => {
    return data.success === true && data.count >= 0;
  });

  // Test 5: Request ID header
  await test('Request ID header', `${BASE_URL}/api/v1/mics`, (data, headers) => {
    return headers['x-request-id'] !== undefined;
  });

  // Test 6: CORS headers
  await test('CORS headers', `${BASE_URL}/api/v1/mics`, (data, headers) => {
    return headers['access-control-allow-origin'] !== undefined;
  });

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`✅ Tests passed: ${testsPassed}`);
  console.log(`❌ Tests failed: ${testsFailed}`);

  if (testsFailed > 0) {
    console.log('\n❌ Smoke tests FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ All smoke tests PASSED');
    process.exit(0);
  }
}

async function test(name, url, validator) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const passed = validator(parsed, res.headers);

          if (passed) {
            console.log(`✅ ${name}`);
            testsPassed++;
          } else {
            console.log(`❌ ${name} - Validation failed`);
            testsFailed++;
          }
        } catch (error) {
          console.log(`❌ ${name} - Error: ${error.message}`);
          testsFailed++;
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      console.log(`❌ ${name} - Request failed: ${error.message}`);
      testsFailed++;
      resolve();
    });

    req.setTimeout(5000, () => {
      console.log(`❌ ${name} - Timeout`);
      testsFailed++;
      req.destroy();
      resolve();
    });
  });
}

runTests();
