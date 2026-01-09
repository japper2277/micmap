/**
 * FULL COMPARISON: Your MTA endpoint vs Transiter
 * Tests every venue, every line, every direction
 * Outputs to transit-api-comparison.txt
 */

const fs = require('fs');
const TRANSITER = 'https://demo.transiter.dev/systems/us-ny-subway';
const LOCAL = 'http://localhost:3001';

// All venues with their nearest stops and lines
const VENUES = {
  // West Village / Greenwich
  'Comedy Shop': { stop: 'D20', mtaStop: 'D20', lines: ['B','D','F','M'] },
  'Greenwich Village Comedy Club': { stop: 'D20', mtaStop: 'D20', lines: ['B','D','F','M'] },
  'Grisly Pear': { stop: 'D20', mtaStop: 'D20', lines: ['B','D','F','M'] },
  'Comedy Village': { stop: 'D20', mtaStop: 'D20', lines: ['B','D','F','M'] },

  // East Village / LES
  'St. Mark\'s Comedy Club': { stop: '636', mtaStop: '636', lines: ['6'] },
  'Astor Pl area': { stop: '636', mtaStop: '636', lines: ['4','5','6'] },
  'Fear City Comedy Club': { stop: 'F14', mtaStop: 'F14', lines: ['F'] },
  'Black Cat LES': { stop: 'F14', mtaStop: 'F14', lines: ['F'] },
  'Caravan of Dreams': { stop: 'F14', mtaStop: 'F14', lines: ['F'] },
  'KGB Bar': { stop: 'F14', mtaStop: 'F14', lines: ['F'] },

  // Union Square
  'UCB': { stop: '635', mtaStop: '635', lines: ['4','5','6','L','N','Q','R','W'] },

  // Chelsea / Flatiron
  'The Stand NYC': { stop: 'D19', mtaStop: 'D19', lines: ['F','M'] },
  'The Pit Midtown': { stop: 'D18', mtaStop: 'D18', lines: ['F','M'] },
  'New York Comedy Club Midtown': { stop: 'D18', mtaStop: 'D18', lines: ['F','M'] },

  // Midtown
  'Broadway Comedy Club': { stop: 'R16', mtaStop: 'R16', lines: ['N','Q','R','W','1','2','3'] },
  'Producer\'s Club': { stop: 'R16', mtaStop: 'R16', lines: ['N','Q','R','W'] },
  'Hotel Edison': { stop: 'R16', mtaStop: 'R16', lines: ['N','Q','R','W'] },

  // Herald Square
  'Grove 34': { stop: 'D17', mtaStop: 'D17', lines: ['B','D','F','M','N','Q','R','W'] },

  // UWS
  'West Side Comedy Club': { stop: '120', mtaStop: '120', lines: ['1','2','3'] },  // 96 St
  'UWS NY Comedy Club': { stop: '120', mtaStop: '120', lines: ['1','2','3'] },

  // UES
  'The Comic Strip Live': { stop: '629', mtaStop: '629', lines: ['4','5','6','N','R','W'] },  // 59 St Lex

  // Harlem
  'Harlem Nights Bar': { stop: '225', mtaStop: '225', lines: ['2','3'] },  // 125 St
  'Comedy in Harlem': { stop: '225', mtaStop: '225', lines: ['2','3'] },

  // Astoria
  'QED Astoria': { stop: 'R05', mtaStop: 'R05', lines: ['N','W'] },  // 30 Av

  // Williamsburg
  'Eastville Comedy Club': { stop: 'L10', mtaStop: 'L10', lines: ['L'] },  // Bedford Av
  'Pete\'s Candy Store': { stop: 'L10', mtaStop: 'L10', lines: ['L'] },
  'Easy Lover BK': { stop: 'L10', mtaStop: 'L10', lines: ['L'] },
  'Alligator Lounge': { stop: 'L12', mtaStop: 'L12', lines: ['L'] },  // Graham Av
  'The Gutter Williamsburg': { stop: 'L12', mtaStop: 'L12', lines: ['L'] },

  // Bushwick
  'Bushwick Comedy Club': { stop: 'L17', mtaStop: 'L17', lines: ['L'] },  // Jefferson St
  'Alphaville': { stop: 'L17', mtaStop: 'L17', lines: ['L'] },
  'BKLYN Made Comedy': { stop: 'L17', mtaStop: 'L17', lines: ['L'] },

  // Greenpoint
  'Good Judy': { stop: 'G26', mtaStop: 'G26', lines: ['G'] },  // Greenpoint Av

  // Park Slope / Gowanus
  'Brooklyn Comedy Collective': { stop: 'R31', mtaStop: 'R31', lines: ['R'] },  // Union St
  'Branded Saloon': { stop: 'D24', mtaStop: 'D24', lines: ['B','Q','2','3','4','5'] },  // Atlantic

  // Crown Heights / Bed-Stuy
  'Caffeine Underground': { stop: 'A46', mtaStop: 'A46', lines: ['A','C'] },  // Nostrand Av
  'The Tiny Cupboard': { stop: 'A46', mtaStop: 'A46', lines: ['A','C'] },

  // Other Brooklyn
  'O\'Keefe\'s Bar': { stop: 'D26', mtaStop: 'D26', lines: ['B','Q'] },  // Prospect Park
  'Freddy\'s Bar': { stop: 'D26', mtaStop: 'D26', lines: ['B','Q'] },

  // LIC
  'Second City': { stop: '719', mtaStop: '719', lines: ['7','G','E','M'] },  // Court Sq
  'Laughing Devil Comedy Club': { stop: '719', mtaStop: '719', lines: ['7'] },
};

// All subway lines grouped by feed
const LINE_FEEDS = {
  '1': 'nyct%2Fgtfs', '2': 'nyct%2Fgtfs', '3': 'nyct%2Fgtfs',
  '4': 'nyct%2Fgtfs', '5': 'nyct%2Fgtfs', '6': 'nyct%2Fgtfs',
  'A': 'nyct%2Fgtfs-ace', 'C': 'nyct%2Fgtfs-ace', 'E': 'nyct%2Fgtfs-ace',
  'B': 'nyct%2Fgtfs-bdfm', 'D': 'nyct%2Fgtfs-bdfm', 'F': 'nyct%2Fgtfs-bdfm', 'M': 'nyct%2Fgtfs-bdfm',
  'N': 'nyct%2Fgtfs-nqrw', 'Q': 'nyct%2Fgtfs-nqrw', 'R': 'nyct%2Fgtfs-nqrw', 'W': 'nyct%2Fgtfs-nqrw',
  'G': 'nyct%2Fgtfs-g',
  'L': 'nyct%2Fgtfs-l',
  'J': 'nyct%2Fgtfs-jz', 'Z': 'nyct%2Fgtfs-jz',
  '7': 'nyct%2Fgtfs-7'
};

let output = [];
let bugCount = 0;
let bugs = [];

function log(msg) {
  console.log(msg);
  output.push(msg);
}

async function getTransiter(stopId, direction) {
  try {
    const res = await fetch(`${TRANSITER}/stops/${stopId}${direction}`, { timeout: 10000 });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = await res.json();
    const now = Date.now() / 1000;

    const arrivals = (data.stopTimes || [])
      .map(st => {
        const time = st.arrival?.time || st.departure?.time;
        if (!time) return null;
        const mins = Math.round((time - now) / 60);
        if (mins < -1 || mins > 20) return null;
        return {
          line: st.trip?.route?.id,
          dest: (st.trip?.destination?.name || st.headsign || '').substring(0, 25),
          mins: Math.max(0, mins),
          tripId: st.trip?.id
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.mins - b.mins);

    return { arrivals, count: arrivals.length };
  } catch (e) {
    return { error: e.message, arrivals: [] };
  }
}

async function getLocal(line, stopId) {
  try {
    const res = await fetch(`${LOCAL}/api/mta/arrivals/${line}/${stopId}`, { timeout: 5000 });
    if (!res.ok) return { error: `HTTP ${res.status}`, arrivals: [] };
    const data = await res.json();
    const arrivals = (Array.isArray(data) ? data : [])
      .filter(a => a.minsAway <= 20)
      .map(a => ({
        line: a.line,
        dir: a.direction,
        mins: a.minsAway,
        dest: a.destination || ''
      }));
    return { arrivals, count: arrivals.length };
  } catch (e) {
    return { error: e.message, arrivals: [] };
  }
}

function findBugs(venue, line, direction, transiter, local) {
  const foundBugs = [];
  const dirLabel = direction === 'N' ? 'Uptown' : 'Downtown';

  // Bug: API error
  if (local.error) {
    foundBugs.push(`API_ERROR: ${local.error}`);
  }

  // Bug: Transiter has data but local doesn't
  if (transiter.arrivals.length > 0 && local.arrivals.length === 0 && !local.error) {
    foundBugs.push(`MISSING_DATA: Transiter has ${transiter.arrivals.length} arrivals, local has 0`);
  }

  // Bug: Duplicates in local
  const localTimes = local.arrivals.map(a => `${a.line}-${a.mins}`);
  const uniqueTimes = [...new Set(localTimes)];
  if (localTimes.length > uniqueTimes.length) {
    foundBugs.push(`DUPLICATES: ${localTimes.length - uniqueTimes.length} duplicate entries`);
  }

  // Bug: Wrong lines returned
  const wrongLines = local.arrivals.filter(a => a.line !== line);
  if (wrongLines.length > 0) {
    const wrongLinesList = [...new Set(wrongLines.map(a => a.line))].join(',');
    foundBugs.push(`WRONG_LINE: Asked for ${line}, got ${wrongLinesList}`);
  }

  // Bug: Missing destination
  const transiterHasDest = transiter.arrivals.some(a => a.dest && a.dest.length > 3);
  const localHasDest = local.arrivals.some(a => a.dest && a.dest.length > 3);
  if (transiterHasDest && !localHasDest && local.arrivals.length > 0) {
    foundBugs.push(`NO_DESTINATION: Local missing destination info`);
  }

  // Bug: Significant time mismatch
  if (transiter.arrivals.length > 0 && local.arrivals.length > 0) {
    const tFirst = transiter.arrivals.find(a => a.line === line);
    const lFirst = local.arrivals.find(a => a.line === line);
    if (tFirst && lFirst && Math.abs(tFirst.mins - lFirst.mins) > 2) {
      foundBugs.push(`TIME_MISMATCH: Transiter says ${tFirst.mins}min, local says ${lFirst.mins}min`);
    }
  }

  // Bug: Far fewer results
  const tLineCount = transiter.arrivals.filter(a => a.line === line).length;
  const lLineCount = local.arrivals.filter(a => a.line === line).length;
  if (tLineCount >= 3 && lLineCount < tLineCount / 2) {
    foundBugs.push(`INCOMPLETE: Transiter has ${tLineCount} ${line} trains, local has ${lLineCount}`);
  }

  return foundBugs;
}

function pad(s, n) { return String(s || '').substring(0, n).padEnd(n); }

async function testVenue(name, venue) {
  log(`\n${'═'.repeat(70)}`);
  log(`📍 ${name}`);
  log(`   Stop: ${venue.stop} | Lines: ${venue.lines.join(', ')}`);
  log('─'.repeat(70));

  for (const dir of ['N', 'S']) {
    const dirLabel = dir === 'N' ? 'UPTOWN/QUEENS/MANHATTAN' : 'DOWNTOWN/BROOKLYN';
    log(`\n  ${dirLabel}:`);
    log('  ' + '-'.repeat(64));

    // Get Transiter data once per direction
    const transiter = await getTransiter(venue.stop, dir);

    if (transiter.error) {
      log(`  TRANSITER ERROR: ${transiter.error}`);
    } else {
      log(`  TRANSITER (${transiter.count} trains):`);
      transiter.arrivals.slice(0, 5).forEach(t => {
        log(`    ${pad(t.line, 2)} → ${pad(t.dest, 25)} ${t.mins} min`);
      });
      if (transiter.arrivals.length === 0) log('    (none)');
    }

    // Test each line
    for (const line of venue.lines) {
      const local = await getLocal(line, venue.stop);

      // Filter local by direction
      const dirFiltered = local.arrivals.filter(a => {
        const d = (a.dir || '').toLowerCase();
        if (dir === 'N') return d.includes('uptown') || d.includes('manhattan') || d.includes('queens') || d.includes('bronx');
        return d.includes('downtown') || d.includes('brooklyn');
      });

      log(`\n  YOUR API - ${line} line:`);
      if (local.error) {
        log(`    ERROR: ${local.error}`);
      } else {
        dirFiltered.slice(0, 4).forEach(a => {
          log(`    ${pad(a.line, 2)}   ${pad(a.dir, 15)} ${pad(a.dest, 10)} ${a.mins} min`);
        });
        if (dirFiltered.length === 0) log('    (none in this direction)');
      }

      // Find bugs
      const localFiltered = { ...local, arrivals: dirFiltered };
      const foundBugs = findBugs(name, line, dir, transiter, localFiltered);
      if (foundBugs.length > 0) {
        log(`  ⚠️  BUGS FOUND:`);
        foundBugs.forEach(bug => {
          log(`      - ${bug}`);
          bugs.push({ venue: name, line, direction: dir === 'N' ? 'Uptown' : 'Downtown', bug });
          bugCount++;
        });
      }
    }
  }
}

async function main() {
  const startTime = new Date();

  log('╔══════════════════════════════════════════════════════════════════════╗');
  log('║         TRANSIT API COMPARISON: Your MTA vs Transiter               ║');
  log('║         Testing all venues, all lines, all directions               ║');
  log(`║         Generated: ${startTime.toISOString()}                  ║`);
  log('╚══════════════════════════════════════════════════════════════════════╝');

  const venueNames = Object.keys(VENUES);
  log(`\nTesting ${venueNames.length} venues...\n`);

  for (const name of venueNames) {
    await testVenue(name, VENUES[name]);
  }

  // Summary
  log('\n');
  log('╔══════════════════════════════════════════════════════════════════════╗');
  log('║                           BUG SUMMARY                                ║');
  log('╚══════════════════════════════════════════════════════════════════════╝');
  log(`\nTotal bugs found: ${bugCount}\n`);

  // Group by bug type
  const bugTypes = {};
  bugs.forEach(b => {
    const type = b.bug.split(':')[0];
    if (!bugTypes[type]) bugTypes[type] = [];
    bugTypes[type].push(b);
  });

  for (const [type, items] of Object.entries(bugTypes)) {
    log(`\n${type} (${items.length} occurrences):`);
    log('-'.repeat(50));
    items.slice(0, 10).forEach(b => {
      log(`  ${b.venue} | ${b.line} ${b.direction}`);
      log(`    ${b.bug}`);
    });
    if (items.length > 10) {
      log(`  ... and ${items.length - 10} more`);
    }
  }

  // Write to file
  const filename = 'transit-api-comparison.txt';
  fs.writeFileSync(filename, output.join('\n'));
  console.log(`\n✅ Results written to ${filename}`);
  console.log(`   Total bugs: ${bugCount}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
