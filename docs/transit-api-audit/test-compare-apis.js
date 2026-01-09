/**
 * Compare: Your MTA endpoint vs Transiter for all comedy venues
 */

const TRANSITER = 'https://demo.transiter.dev/systems/us-ny-subway';
const LOCAL = 'http://localhost:3001';

// Venue coords from server.js
const VENUES = {
  'Comedy Shop': { lat: 40.7288305, lng: -74.0001342, stop: 'D20', lines: ['B','D','F','M'] },
  'Greenwich Village Comedy Club': { lat: 40.7296565, lng: -74.001091, stop: 'D20', lines: ['B','D','F','M'] },
  'Grisly Pear': { lat: 40.7318243, lng: -74.0036027, stop: 'D20', lines: ['B','D','F','M'] },
  'The Stand NYC': { lat: 40.7366948, lng: -73.9844585, stop: 'D19', lines: ['F','M'] },
  'UCB': { lat: 40.7305356, lng: -73.9878055, stop: '635', lines: ['4','5','6','N','Q','R','W','L'] },
  'The Pit Midtown': { lat: 40.7405356, lng: -73.9848055, stop: 'D18', lines: ['F','M'] },
  'St. Mark\'s Comedy Club': { lat: 40.729, lng: -73.989, stop: '636', lines: ['6'] },
  'Eastville Comedy Club': { lat: 40.7142545, lng: -73.9613017, stop: 'L10', lines: ['L'] },
  'QED Astoria': { lat: 40.775548, lng: -73.9149401, stop: 'R05', lines: ['N','W'] },
  'West Side Comedy Club': { lat: 40.7808191, lng: -73.9805102, stop: 'A19', lines: ['1','2','3'] },
  'Broadway Comedy Club': { lat: 40.7644391, lng: -73.9856707, stop: 'R16', lines: ['N','Q','R','W'] },
  'New York Comedy Club Midtown': { lat: 40.7389213, lng: -73.9808057, stop: 'D18', lines: ['F','M'] },
  'Bushwick Comedy Club': { lat: 40.6955342, lng: -73.9288494, stop: 'L17', lines: ['L'] },
  'Brooklyn Comedy Collective': { lat: 40.6955342, lng: -73.9288494, stop: 'L17', lines: ['L'] },
  'Pete\'s Candy Store': { lat: 40.7180926, lng: -73.9502883, stop: 'L10', lines: ['L'] },
};

async function getTransiter(stopId, direction) {
  try {
    const res = await fetch(`${TRANSITER}/stops/${stopId}${direction}`);
    const data = await res.json();
    const now = Date.now() / 1000;

    return (data.stopTimes || [])
      .map(st => {
        const time = st.arrival?.time || st.departure?.time;
        if (!time) return null;
        const mins = Math.round((time - now) / 60);
        if (mins < -1 || mins > 20) return null;
        return {
          line: st.trip?.route?.id,
          dest: (st.trip?.destination?.name || '').substring(0, 20),
          mins: Math.max(0, mins)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.mins - b.mins)
      .slice(0, 4);
  } catch (e) {
    return [{ error: e.message }];
  }
}

async function getLocal(line, stopId) {
  try {
    const res = await fetch(`${LOCAL}/api/mta/arrivals/${line}/${stopId}`);
    const data = await res.json();
    return data
      .filter(a => a.minsAway <= 20)
      .slice(0, 4)
      .map(a => ({
        line: a.line,
        dir: a.direction,
        mins: a.minsAway
      }));
  } catch (e) {
    return [{ error: e.message }];
  }
}

function pad(s, n) { return String(s || '').substring(0, n).padEnd(n); }

async function compareVenue(name, venue) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📍 ${name}`);
  console.log(`   Stop: ${venue.stop} | Lines: ${venue.lines.join(', ')}`);
  console.log('─'.repeat(60));

  for (const dir of ['N', 'S']) {
    const dirLabel = dir === 'N' ? 'UPTOWN/QUEENS' : 'DOWNTOWN/BKLYN';
    console.log(`\n  ${dirLabel}:`);
    console.log('  ' + '-'.repeat(54));

    // Transiter
    const transiter = await getTransiter(venue.stop, dir);
    console.log(`  TRANSITER: ${transiter.length === 0 ? '(none)' : ''}`);
    transiter.forEach(t => {
      if (t.error) console.log(`    ERROR: ${t.error}`);
      else console.log(`    ${pad(t.line, 2)} → ${pad(t.dest, 20)} ${t.mins} min`);
    });

    // Local - query each line
    console.log(`  YOUR API:`);
    const localResults = [];
    for (const line of venue.lines) {
      const arrivals = await getLocal(line, venue.stop);
      arrivals
        .filter(a => !a.error)
        .filter(a => {
          // Match direction
          const d = (a.dir || '').toLowerCase();
          if (dir === 'N') return d.includes('uptown') || d.includes('manhattan') || d.includes('queens');
          return d.includes('downtown') || d.includes('brooklyn');
        })
        .forEach(a => localResults.push(a));
    }
    localResults.sort((a, b) => a.mins - b.mins);
    if (localResults.length === 0) {
      console.log('    (none)');
    } else {
      localResults.slice(0, 4).forEach(a => {
        console.log(`    ${pad(a.line, 2)}   ${pad(a.dir, 20)} ${a.mins} min`);
      });
    }
  }
}

async function main() {
  console.log('\n🔍 COMPARING: Transiter vs Your MTA API');
  console.log('━'.repeat(60));

  for (const [name, venue] of Object.entries(VENUES)) {
    await compareVenue(name, venue);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('Done.\n');
}

main().catch(console.error);
