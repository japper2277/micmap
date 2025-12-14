#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const micsPath = path.join(__dirname, '../api/mics.json');
const scriptsDir = __dirname;

// List of scripts to run when mics.json changes
const scriptsToRun = [
  'generate-venue-list.js',
  // Add more scripts here as needed:
  // 'generate-stats.js',
  // 'update-map-data.js',
];

console.log('👀 Watching mics.json for changes...');
console.log(`   Will run: ${scriptsToRun.join(', ')}\n`);

let debounceTimer;

fs.watch(micsPath, (eventType) => {
  if (eventType === 'change') {
    // Debounce to avoid multiple runs for single save
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`\n📝 mics.json changed at ${new Date().toLocaleTimeString()}`);
      console.log('Running scripts...\n');

      scriptsToRun.forEach(script => {
        const scriptPath = path.join(scriptsDir, script);
        exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
          if (error) {
            console.error(`❌ ${script}: ${error.message}`);
            return;
          }
          if (stderr) {
            console.error(`⚠️  ${script}: ${stderr}`);
          }
          if (stdout) {
            console.log(`   ${stdout.trim()}`);
          }
        });
      });
    }, 100);
  }
});

console.log('Press Ctrl+C to stop watching.\n');
