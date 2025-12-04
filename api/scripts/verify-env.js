#!/usr/bin/env node
// verify-env.js - Pre-deployment environment variable checker

const required = [
  'MONGODB_URI',
  'GOOGLE_API_KEY',
  'SHEET_ID'
];

const optional = [
  'REDIS_URL',
  'SHEET_RANGE',
  'PORT',
  'NODE_ENV'
];

console.log('🔍 Verifying environment variables...\n');

let hasErrors = false;

// Check required variables
console.log('Required variables:');
required.forEach(key => {
  if (process.env[key]) {
    console.log(`  ✅ ${key}: ${maskValue(key, process.env[key])}`);
  } else {
    console.log(`  ❌ ${key}: MISSING`);
    hasErrors = true;
  }
});

console.log('\nOptional variables:');
optional.forEach(key => {
  if (process.env[key]) {
    console.log(`  ✅ ${key}: ${maskValue(key, process.env[key])}`);
  } else {
    console.log(`  ⚠️  ${key}: not set (using defaults)`);
  }
});

// Validate MongoDB URI format
if (process.env.MONGODB_URI) {
  if (!process.env.MONGODB_URI.startsWith('mongodb://') &&
      !process.env.MONGODB_URI.startsWith('mongodb+srv://')) {
    console.log('\n❌ MONGODB_URI must start with mongodb:// or mongodb+srv://');
    hasErrors = true;
  }
}

console.log('\n' + '='.repeat(50));

if (hasErrors) {
  console.log('❌ Environment verification FAILED');
  console.log('\nMissing required variables. Please set them in .env file or environment.');
  process.exit(1);
} else {
  console.log('✅ All required environment variables present');
  process.exit(0);
}

function maskValue(key, value) {
  // Mask sensitive values
  if (key.includes('KEY') || key.includes('URI') || key.includes('URL')) {
    if (value.length < 20) return '****';
    return value.substring(0, 8) + '...' + value.substring(value.length - 4);
  }
  return value;
}
