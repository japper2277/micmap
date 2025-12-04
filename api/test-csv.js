const fs = require('fs');

const csvPath = './mics.csv';
const fileContent = fs.readFileSync(csvPath, 'utf-8');
const lines = fileContent.split('\n');

console.log('Total lines:', lines.length);
console.log('\nLine 0 (junk):', lines[0].substring(0, 100));
console.log('\nLine 1 (headers):', lines[1].substring(0, 100));
console.log('\nLine 2 (first data):', lines[2].substring(0, 100));

const headers = lines[1].split(',').map(h => h.trim());
console.log('\nHeaders found:', headers.slice(0, 10));

// Try parsing line 2
const line = lines[2];
const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
console.log('\nValues from line 2:', values.slice(0, 5));

const row = {};
values.forEach((val, idx) => {
  if (idx < headers.length) {
    row[headers[idx]] = val.replace(/^"(.*)"$/, '$1').trim();
  }
});

console.log('\nParsed row:', {
  'Open Mic': row['Open Mic'],
  'Venue Name': row['Venue Name'],
  'Day': row['Day']
});
