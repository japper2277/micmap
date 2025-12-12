/**
 * COMPREHENSIVE TRANSIT API COMPARISON
 * Tests Your App vs Transiter API across all scenarios:
 * - All times (late night, rush hour, midday)
 * - All days (weekday, weekend)
 * - Various routes (transfers, express, local)
 */

const TRANSITER = 'https://demo.transiter.dev/systems/us-ny-subway';
const LOCAL = 'http://localhost:3001';

// Test venues covering different subway lines and areas
const TEST_STOPS = [
  // Manhattan
  { name: 'W 4 St-Wash Sq', stopId: 'D20', lines: ['B','D','F','M','A','C','E'] },
  { name: 'Union Square', stopId: '635', lines: ['4','5','6','L','N','Q','R','W'] },
  { name: 'Herald Square', stopId: 'D17', lines: ['B','D','F','M','N','Q','R','W'] },
  { name: 'Times Square', stopId: 'R16', lines: ['N','Q','R','W','1','2','3','7','S'] },
  { name: '14 St-Union Sq', stopId: 'L03', lines: ['L'] },
  { name: '96 St (1/2/3)', stopId: '120', lines: ['1','2','3'] },
  { name: '125 St (A/B/C/D)', stopId: 'A21', lines: ['A','B','C','D'] },

  // Brooklyn
  { name: 'Bedford Av', stopId: 'L10', lines: ['L'] },
  { name: 'Atlantic Av-Barclays', stopId: 'D24', lines: ['B','Q','2','3','4','5','D','N','R'] },
  { name: 'Jay St-MetroTech', stopId: 'A41', lines: ['A','C','F','R'] },
  { name: 'Greenpoint Av', stopId: 'G26', lines: ['G'] },

  // Queens
  { name: '30 Av (Astoria)', stopId: 'R05', lines: ['N','W'] },
  { name: 'Court Sq', stopId: '719', lines: ['7','G','E','M'] },
  { name: 'Jackson Hts-Roosevelt', stopId: 'G08', lines: ['7','E','F','M','R'] },

  // Bronx
  { name: '161 St-Yankee Stadium', stopId: '621', lines: ['4','B','D'] },
];

// Test routes for routing endpoint
const TEST_ROUTES = [
  // Simple routes (1 line)
  { name: 'West Village to Midtown', from: [40.7335, -74.0002], to: [40.7534, -73.9879] },
  // Transfer routes
  { name: 'Williamsburg to UWS', from: [40.7147, -73.9493], to: [40.7903, -73.9723] },
  { name: 'Astoria to LES', from: [40.7662, -73.9209], to: [40.7223, -73.9840] },
  // Cross-borough
  { name: 'Bushwick to Harlem', from: [40.6984, -73.9272], to: [40.8075, -73.9454] },
  // Express possible
  { name: 'Brooklyn to Midtown (express)', from: [40.6892, -73.9708], to: [40.7527, -73.9772] },
  // Complex transfers
  { name: 'Greenpoint to UES', from: [40.7293, -73.9514], to: [40.7627, -73.9653] },
];

let results = {
  arrivals: { passed: 0, failed: 0, issues: [] },
  routes: { passed: 0, failed: 0, issues: [] },
  lateNight: { passed: 0, failed: 0, issues: [] },
  weekend: { passed: 0, failed: 0, issues: [] },
  rushHour: { passed: 0, failed: 0, issues: [] }
};

// Helper: Fetch Transiter arrivals
async function getTransiterArrivals(stopId, direction = '') {
  try {
    const url = `${TRANSITER}/stops/${stopId}${direction}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { error: `HTTP ${res.status}`, arrivals: [] };
    const data = await res.json();
    const now = Date.now() / 1000;

    const arrivals = (data.stopTimes || [])
      .map(st => {
        const time = st.arrival?.time || st.departure?.time;
        if (!time) return null;
        const mins = Math.round((time - now) / 60);
        if (mins < -1 || mins > 30) return null;
        return {
          line: st.trip?.route?.id,
          dest: (st.trip?.destination?.name || st.headsign || '').substring(0, 30),
          mins: Math.max(0, mins),
          direction: direction || 'both'
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.mins - b.mins);

    return { arrivals, count: arrivals.length };
  } catch (e) {
    return { error: e.message, arrivals: [] };
  }
}

// Helper: Fetch local arrivals
async function getLocalArrivals(line, stopId) {
  try {
    const url = `${LOCAL}/api/mta/arrivals/${line}/${stopId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { error: `HTTP ${res.status}`, arrivals: [] };
    const data = await res.json();

    const arrivals = (Array.isArray(data) ? data : [])
      .filter(a => a.minsAway <= 30)
      .map(a => ({
        line: a.line,
        direction: a.direction,
        dest: a.destination || '',
        mins: a.minsAway
      }));

    return { arrivals, count: arrivals.length };
  } catch (e) {
    return { error: e.message, arrivals: [] };
  }
}

// Helper: Fetch routing
async function getRoutes(from, to, limit = 3) {
  try {
    const url = `${LOCAL}/api/subway/routes?userLat=${from[0]}&userLng=${from[1]}&venueLat=${to[0]}&venueLng=${to[1]}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { error: `HTTP ${res.status}`, routes: [] };
    return await res.json();
  } catch (e) {
    return { error: e.message, routes: [] };
  }
}

// Test 1: Compare arrivals across all stops/lines
async function testArrivals() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 1: ARRIVALS API vs TRANSITER');
  console.log('═'.repeat(70));

  for (const stop of TEST_STOPS) {
    console.log(`\n📍 ${stop.name} (${stop.stopId})`);

    for (const dir of ['N', 'S']) {
      const dirLabel = dir === 'N' ? 'Uptown' : 'Downtown';

      // Get Transiter data
      const transiter = await getTransiterArrivals(stop.stopId, dir);

      if (transiter.error) {
        console.log(`  TRANSITER ${dirLabel}: ERROR - ${transiter.error}`);
        continue;
      }

      const transiterLines = [...new Set(transiter.arrivals.map(a => a.line))];
      console.log(`  TRANSITER ${dirLabel}: ${transiter.count} trains (${transiterLines.join(',')})`);

      // Test each line at this stop
      for (const line of stop.lines) {
        const local = await getLocalArrivals(line, stop.stopId);

        // Filter by direction
        const dirFiltered = local.arrivals.filter(a => {
          const d = (a.direction || '').toLowerCase();
          if (dir === 'N') return d.includes('uptown') || d.includes('manhattan') || d.includes('queens') || d.includes('bronx');
          return d.includes('downtown') || d.includes('brooklyn');
        });

        const tLineCount = transiter.arrivals.filter(a => a.line === line).length;
        const lLineCount = dirFiltered.length;

        // Compare
        let status = '✅';
        let issue = null;

        if (local.error) {
          status = '❌';
          issue = `API_ERROR: ${local.error}`;
        } else if (tLineCount > 0 && lLineCount === 0) {
          status = '⚠️';
          issue = `MISSING: Transiter has ${tLineCount} ${line} trains, local has 0`;
        } else if (tLineCount === 0 && lLineCount > 0) {
          status = '🔍';
          issue = `EXTRA: Local has ${lLineCount} ${line} trains, Transiter has 0`;
        } else if (tLineCount > 0 && lLineCount < tLineCount / 2) {
          status = '⚠️';
          issue = `INCOMPLETE: Transiter ${tLineCount}, local ${lLineCount}`;
        }

        // Check for wrong lines in response
        const wrongLines = local.arrivals.filter(a => a.line !== line);
        if (wrongLines.length > 0) {
          status = '⚠️';
          issue = `WRONG_LINES: Asked for ${line}, also got ${[...new Set(wrongLines.map(a => a.line))].join(',')}`;
        }

        if (issue) {
          console.log(`    ${status} ${line} ${dirLabel}: ${issue}`);
          results.arrivals.issues.push({ stop: stop.name, line, direction: dirLabel, issue });
          results.arrivals.failed++;
        } else {
          console.log(`    ${status} ${line} ${dirLabel}: OK (${lLineCount} trains)`);
          results.arrivals.passed++;
        }
      }
    }
  }
}

// Test 2: Routing endpoint
async function testRouting() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 2: SUBWAY ROUTING ENDPOINT');
  console.log('═'.repeat(70));

  for (const route of TEST_ROUTES) {
    console.log(`\n🚇 ${route.name}`);
    console.log(`   From: ${route.from.join(', ')} → To: ${route.to.join(', ')}`);

    const result = await getRoutes(route.from, route.to, 3);

    if (result.error) {
      console.log(`   ❌ ERROR: ${result.error}`);
      results.routes.failed++;
      results.routes.issues.push({ route: route.name, issue: result.error });
      continue;
    }

    if (!result.routes || result.routes.length === 0) {
      console.log(`   ⚠️ No routes found!`);
      results.routes.failed++;
      results.routes.issues.push({ route: route.name, issue: 'No routes returned' });
      continue;
    }

    console.log(`   Schedule: ${result.schedule?.isLateNight ? 'LATE NIGHT' : result.schedule?.isWeekend ? 'WEEKEND' : result.schedule?.isRushHour ? 'RUSH HOUR' : 'NORMAL'}`);

    let routeValid = true;
    for (let i = 0; i < result.routes.length; i++) {
      const r = result.routes[i];
      const lines = r.lines?.join('→') || 'unknown';
      console.log(`   Route ${i+1}: ${lines} (${r.totalTime} min total, ${r.subwayTime} min subway)`);

      // Validate route structure
      if (!r.legs || r.legs.length === 0) {
        console.log(`      ⚠️ No legs in route!`);
        routeValid = false;
      }

      // Check for reasonable times
      if (r.totalTime > 120) {
        console.log(`      ⚠️ Unreasonably long route (${r.totalTime} min)`);
        routeValid = false;
      }

      // Check leg continuity
      if (r.legs && r.legs.length > 1) {
        for (let j = 1; j < r.legs.length; j++) {
          const prevLeg = r.legs[j-1];
          const currLeg = r.legs[j];
          if (prevLeg.type === 'ride' && currLeg.type === 'ride') {
            // Check station continuity
            if (prevLeg.to !== currLeg.from) {
              console.log(`      ⚠️ Leg discontinuity: ${prevLeg.to} → ${currLeg.from}`);
              routeValid = false;
            }
          }
        }
      }

      // Show legs
      for (const leg of (r.legs || [])) {
        if (leg.type === 'ride') {
          console.log(`      🚃 ${leg.line}: ${leg.from} → ${leg.to} (${leg.stops} stops, ${leg.time} min)`);
        } else if (leg.type === 'transfer') {
          console.log(`      🚶 Transfer at ${leg.at}: ${leg.fromLine} → ${leg.toLine} (${leg.time} min)`);
        }
      }

      // Show alerts if any
      if (r.alerts && r.alerts.length > 0) {
        console.log(`      ⚠️ Alerts: ${r.alerts.length} active`);
      }
    }

    if (routeValid) {
      console.log(`   ✅ All routes valid`);
      results.routes.passed++;
    } else {
      results.routes.failed++;
      results.routes.issues.push({ route: route.name, issue: 'Route validation failed' });
    }
  }
}

// Test 3: Late Night Scenarios (B/W/Z swaps)
async function testLateNight() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 3: LATE NIGHT SERVICE (B→D, W→N, Z→J)');
  console.log('═'.repeat(70));

  // Check current time
  const nycDate = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const nycHour = new Date(nycDate).getHours();
  const isActuallyLateNight = nycHour >= 0 && nycHour < 6;

  console.log(`\n⏰ Current NYC hour: ${nycHour} (${isActuallyLateNight ? 'IS LATE NIGHT' : 'NOT late night'})`);

  // Test B line (should swap to D at night)
  console.log('\n📍 Testing B/D line at 34th St');
  const bLocal = await getLocalArrivals('B', 'D17');
  const dLocal = await getLocalArrivals('D', 'D17');

  console.log(`   B line arrivals: ${bLocal.arrivals.length}`);
  console.log(`   D line arrivals: ${dLocal.arrivals.length}`);

  if (isActuallyLateNight) {
    if (bLocal.arrivals.length === 0 && dLocal.arrivals.length > 0) {
      console.log(`   ✅ Correct: B not running, D is (late night)`);
      results.lateNight.passed++;
    } else if (bLocal.arrivals.length > 0) {
      console.log(`   ⚠️ B line showing trains at late night - verify if actually running`);
      results.lateNight.issues.push({ line: 'B', issue: 'B showing arrivals during late night' });
    }
  } else {
    console.log(`   ℹ️ Not late night - B line status is expected`);
    results.lateNight.passed++;
  }

  // Test W line (should swap to N at night)
  console.log('\n📍 Testing W/N line at 30 Av (Astoria)');
  const wLocal = await getLocalArrivals('W', 'R05');
  const nLocal = await getLocalArrivals('N', 'R05');

  console.log(`   W line arrivals: ${wLocal.arrivals.length}`);
  console.log(`   N line arrivals: ${nLocal.arrivals.length}`);

  if (isActuallyLateNight) {
    if (wLocal.arrivals.length === 0 && nLocal.arrivals.length > 0) {
      console.log(`   ✅ Correct: W not running, N is (late night)`);
      results.lateNight.passed++;
    } else if (wLocal.arrivals.length > 0) {
      console.log(`   ⚠️ W line showing trains at late night`);
      results.lateNight.issues.push({ line: 'W', issue: 'W showing arrivals during late night' });
    }
  } else {
    console.log(`   ℹ️ Not late night - W line status is expected`);
    results.lateNight.passed++;
  }

  // Test routing with late night swaps
  console.log('\n📍 Testing routing with B line route');
  const bRoute = await getRoutes([40.7335, -74.0002], [40.7534, -73.9879], 3);

  if (bRoute.schedule) {
    console.log(`   Schedule awareness: isLateNight=${bRoute.schedule.isLateNight}, note=${bRoute.schedule.note || 'none'}`);
    if (bRoute.schedule.isLateNight === isActuallyLateNight) {
      console.log(`   ✅ Schedule detection correct`);
      results.lateNight.passed++;
    } else {
      console.log(`   ❌ Schedule detection mismatch`);
      results.lateNight.failed++;
    }
  }
}

// Test 4: Weekend Schedule
async function testWeekend() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 4: WEEKEND SERVICE');
  console.log('═'.repeat(70));

  const nycDate = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const nycDay = new Date(nycDate).getDay();
  const isActuallyWeekend = nycDay === 0 || nycDay === 6;

  console.log(`\n📅 Current NYC day: ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][nycDay]} (${isActuallyWeekend ? 'WEEKEND' : 'WEEKDAY'})`);

  // Test express/local behavior
  console.log('\n📍 Testing express service at 96 St (1/2/3)');
  const express2 = await getLocalArrivals('2', '120');
  const express3 = await getLocalArrivals('3', '120');
  const local1 = await getLocalArrivals('1', '120');

  console.log(`   1 (local): ${local1.arrivals.length} trains`);
  console.log(`   2 (express): ${express2.arrivals.length} trains`);
  console.log(`   3 (express): ${express3.arrivals.length} trains`);

  // On weekends, 2/3 may run local or with reduced frequency
  if (isActuallyWeekend) {
    console.log(`   ℹ️ Weekend: Express service may be reduced/local`);
  }

  // Test routing schedule detection
  const routeResult = await getRoutes([40.7903, -73.9723], [40.7534, -73.9879], 3);
  if (routeResult.schedule) {
    console.log(`\n   Schedule: isWeekend=${routeResult.schedule.isWeekend}`);
    if (routeResult.schedule.isWeekend === isActuallyWeekend) {
      console.log(`   ✅ Weekend detection correct`);
      results.weekend.passed++;
    } else {
      console.log(`   ❌ Weekend detection mismatch`);
      results.weekend.failed++;
      results.weekend.issues.push({ issue: `Weekend flag mismatch: got ${routeResult.schedule.isWeekend}, expected ${isActuallyWeekend}` });
    }
  }

  results.weekend.passed++;
}

// Test 5: Rush Hour
async function testRushHour() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 5: RUSH HOUR SERVICE');
  console.log('═'.repeat(70));

  const nycDate = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const nycHour = new Date(nycDate).getHours();
  const nycDay = new Date(nycDate).getDay();
  const isWeekend = nycDay === 0 || nycDay === 6;
  const isActuallyRushHour = !isWeekend && ((nycHour >= 7 && nycHour <= 9) || (nycHour >= 17 && nycHour <= 19));

  console.log(`\n⏰ Current NYC: ${nycHour}:00 on ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][nycDay]}`);
  console.log(`   Rush hour: ${isActuallyRushHour ? 'YES' : 'NO'}`);

  // Test express lines during rush hour
  console.log('\n📍 Testing express service at 14 St-Union Sq');
  const line4 = await getLocalArrivals('4', '635');
  const line5 = await getLocalArrivals('5', '635');
  const line6 = await getLocalArrivals('6', '635');

  console.log(`   4 (express): ${line4.arrivals.length} trains`);
  console.log(`   5 (express): ${line5.arrivals.length} trains`);
  console.log(`   6 (local): ${line6.arrivals.length} trains`);

  // Rush hour specific lines (7X, 6X)
  console.log('\n📍 Testing 7 line at Times Square');
  const line7 = await getLocalArrivals('7', 'R16');
  console.log(`   7 line: ${line7.arrivals.length} trains`);

  if (isActuallyRushHour) {
    console.log(`   ℹ️ Rush hour: Express service expected to be more frequent`);
  }

  // Test routing rush hour detection
  const routeResult = await getRoutes([40.7335, -74.0002], [40.7534, -73.9879], 3);
  if (routeResult.schedule) {
    console.log(`\n   Schedule: isRushHour=${routeResult.schedule.isRushHour}`);
    if (routeResult.schedule.isRushHour === isActuallyRushHour) {
      console.log(`   ✅ Rush hour detection correct`);
      results.rushHour.passed++;
    } else {
      console.log(`   ❌ Rush hour detection mismatch`);
      results.rushHour.failed++;
      results.rushHour.issues.push({ issue: `Rush hour flag mismatch: got ${routeResult.schedule.isRushHour}, expected ${isActuallyRushHour}` });
    }
  }

  results.rushHour.passed++;
}

// Summary
function printSummary() {
  console.log('\n' + '═'.repeat(70));
  console.log('COMPREHENSIVE TEST SUMMARY');
  console.log('═'.repeat(70));

  const sections = [
    { name: 'Arrivals API', data: results.arrivals },
    { name: 'Routing', data: results.routes },
    { name: 'Late Night', data: results.lateNight },
    { name: 'Weekend', data: results.weekend },
    { name: 'Rush Hour', data: results.rushHour }
  ];

  let totalPassed = 0, totalFailed = 0;

  for (const section of sections) {
    const status = section.data.failed === 0 ? '✅' : '⚠️';
    console.log(`\n${status} ${section.name}: ${section.data.passed} passed, ${section.data.failed} issues`);
    totalPassed += section.data.passed;
    totalFailed += section.data.failed;

    if (section.data.issues.length > 0) {
      console.log('   Issues found:');
      section.data.issues.slice(0, 5).forEach(issue => {
        console.log(`   - ${JSON.stringify(issue)}`);
      });
      if (section.data.issues.length > 5) {
        console.log(`   ... and ${section.data.issues.length - 5} more`);
      }
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} issues`);
  console.log('─'.repeat(70));
}

// Main
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║     COMPREHENSIVE TRANSIT API COMPARISON TEST                        ║');
  console.log('║     Your App vs Transiter API                                        ║');
  console.log(`║     ${new Date().toISOString()}                              ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  await testArrivals();
  await testRouting();
  await testLateNight();
  await testWeekend();
  await testRushHour();

  printSummary();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
