#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const micsPath = path.join(__dirname, '../api/mics.json');
const outputPath = path.join(__dirname, '../venue-addresses.txt');

const mics = JSON.parse(fs.readFileSync(micsPath, 'utf8'));

// Get unique venues
const venues = {};
mics.forEach(mic => {
  if (!venues[mic.venue]) {
    venues[mic.venue] = {
      address: mic.address,
      neighborhood: mic.neighborhood,
      borough: mic.borough,
      lat: mic.lat,
      lng: mic.lng
    };
  }
});

// Sort by borough, then venue name
const sorted = Object.entries(venues).sort((a, b) => {
  if (a[1].borough !== b[1].borough) return a[1].borough.localeCompare(b[1].borough);
  return a[0].localeCompare(b[0]);
});

let output = 'NYC COMEDY OPEN MIC VENUES - ADDRESS LIST\n';
output += '==========================================\n';
output += `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n`;
output += `Total Venues: ${sorted.length}\n\n`;

let currentBorough = '';
sorted.forEach(([venue, info]) => {
  if (info.borough !== currentBorough) {
    currentBorough = info.borough;
    output += `\n=== ${currentBorough.toUpperCase()} ===\n\n`;
  }
  output += `${venue}\n`;
  output += `  ${info.address}\n`;
  output += `  (${info.neighborhood})\n`;
  output += `  Lat: ${info.lat}, Lng: ${info.lng}\n\n`;
});

fs.writeFileSync(outputPath, output);
console.log(`✓ Generated venue-addresses.txt with ${sorted.length} venues`);
