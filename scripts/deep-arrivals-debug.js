/**
 * DEEP ARRIVALS DEBUG
 * Investigate specific issues found in comprehensive test
 */

const TRANSITER = 'https://demo.transiter.dev/systems/us-ny-subway';
const LOCAL = 'http://localhost:3001';

// Issues to investigate
const ISSUES = [
  { stop: 'D20', stopName: 'W 4 St-Wash Sq', line: 'M', direction: 'S', issue: 'M Downtown missing' },
  { stop: '635', stopName: 'Union Square', line: '6', direction: 'N', issue: '6 Uptown incomplete' },
  { stop: 'L03', stopName: '14 St-Union Sq', line: 'L', direction: 'N', issue: 'L Uptown incomplete' },
  { stop: '719', stopName: 'Court Sq', line: '7', direction: 'N', issue: '7 incomplete' },
  { stop: 'G08', stopName: 'Jackson Hts', line: 'M', direction: 'S', issue: 'M Downtown missing' },
];

async function getTransiterDetailed(stopId, dir) {
  try {
    const url = `${TRANSITER}/stops/${stopId}${dir}`;
    console.log(`   Fetching: ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = await res.json();
    const now = Date.now() / 1000;

    console.log(`   Raw stopTimes: ${(data.stopTimes || []).length}`);

    const arrivals = (data.stopTimes || [])
      .map(st => {
        const time = st.arrival?.time || st.departure?.time;
        if (!time) return null;
        const mins = Math.round((time - now) / 60);
        if (mins < -1 || mins > 30) return null;
        return {
          line: st.trip?.route?.id,
          dest: st.trip?.destination?.name || st.headsign || '',
          mins: Math.max(0, mins),
          tripId: st.trip?.id
        };
      })
      .filter(Boolean);

    return { arrivals, raw: data };
  } catch (e) {
    return { error: e.message };
  }
}

async function getLocalDetailed(line, stopId) {
  try {
    const url = `${LOCAL}/api/mta/arrivals/${line}/${stopId}`;
    console.log(`   Fetching: ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = await res.json();
    return { arrivals: data, raw: data };
  } catch (e) {
    return { error: e.message };
  }
}

async function investigateIssue(issue) {
  console.log('\n' + '═'.repeat(70));
  console.log(`INVESTIGATING: ${issue.stopName} - ${issue.line} ${issue.direction === 'N' ? 'Uptown' : 'Downtown'}`);
  console.log(`Issue: ${issue.issue}`);
  console.log('═'.repeat(70));

  // Get Transiter data
  console.log('\n📡 TRANSITER API:');
  const transiter = await getTransiterDetailed(issue.stop, issue.direction);
  if (transiter.error) {
    console.log(`   ERROR: ${transiter.error}`);
  } else {
    const lineArrivals = transiter.arrivals.filter(a => a.line === issue.line);
    console.log(`   Total arrivals: ${transiter.arrivals.length}`);
    console.log(`   ${issue.line} line arrivals: ${lineArrivals.length}`);
    lineArrivals.slice(0, 6).forEach(a => {
      console.log(`     ${a.line} → ${a.dest.substring(0, 25).padEnd(25)} ${a.mins} min`);
    });

    // Show all lines present
    const allLines = [...new Set(transiter.arrivals.map(a => a.line))];
    console.log(`   Lines present: ${allLines.join(', ')}`);
  }

  // Get local data
  console.log('\n🖥️  LOCAL API:');
  const local = await getLocalDetailed(issue.line, issue.stop);
  if (local.error) {
    console.log(`   ERROR: ${local.error}`);
  } else {
    console.log(`   Total arrivals: ${local.arrivals.length}`);

    // Filter by direction
    const dirFiltered = local.arrivals.filter(a => {
      const d = (a.direction || '').toLowerCase();
      if (issue.direction === 'N') return d.includes('uptown') || d.includes('manhattan') || d.includes('queens') || d.includes('bronx');
      return d.includes('downtown') || d.includes('brooklyn');
    });

    console.log(`   After direction filter (${issue.direction}): ${dirFiltered.length}`);
    dirFiltered.slice(0, 6).forEach(a => {
      console.log(`     ${a.line} (${a.direction}) → ${(a.destination || '').substring(0, 20).padEnd(20)} ${a.minsAway} min`);
    });

    // Show all directions present
    const allDirs = [...new Set(local.arrivals.map(a => a.direction))];
    console.log(`   Directions present: ${allDirs.join(', ')}`);

    // Show all raw arrivals
    console.log('\n   All raw arrivals:');
    local.arrivals.slice(0, 10).forEach(a => {
      console.log(`     ${a.line} [${a.direction}] → ${a.destination || 'N/A'} in ${a.minsAway} min`);
    });
  }

  // Diagnosis
  console.log('\n🔍 DIAGNOSIS:');
  if (transiter.arrivals && local.arrivals) {
    const tCount = transiter.arrivals.filter(a => a.line === issue.line).length;
    const lCount = local.arrivals.length;

    if (lCount === 0 && tCount > 0) {
      console.log('   ❌ LOCAL API RETURNING NO DATA for this line');
      console.log('   Possible causes:');
      console.log('   - Wrong stop ID mapping');
      console.log('   - MTA feed issue');
      console.log('   - Line filtering issue');
    } else if (lCount < tCount / 2) {
      console.log(`   ⚠️ LOCAL API INCOMPLETE: ${lCount} vs ${tCount} (Transiter)`);
      console.log('   Possible causes:');
      console.log('   - arrivals capped at 6');
      console.log('   - direction filtering too strict');
      console.log('   - time window difference');
    } else {
      console.log('   ✅ Data looks comparable');
    }
  }
}

// Also test the specific M line direction issue
async function testMLineDirections() {
  console.log('\n' + '═'.repeat(70));
  console.log('M LINE DIRECTION ANALYSIS');
  console.log('═'.repeat(70));

  const stops = ['D20', 'D17', 'G08'];
  for (const stopId of stops) {
    console.log(`\n📍 Stop: ${stopId}`);

    // Get local M line data
    const local = await getLocalDetailed('M', stopId);
    if (local.arrivals) {
      console.log(`   Total M arrivals: ${local.arrivals.length}`);
      local.arrivals.forEach(a => {
        console.log(`     ${a.line} [${a.direction}] → ${a.destination || 'N/A'} in ${a.minsAway} min`);
      });

      // Check direction distribution
      const uptownCount = local.arrivals.filter(a => {
        const d = (a.direction || '').toLowerCase();
        return d.includes('uptown') || d.includes('manhattan') || d.includes('queens');
      }).length;

      const downtownCount = local.arrivals.filter(a => {
        const d = (a.direction || '').toLowerCase();
        return d.includes('downtown') || d.includes('brooklyn');
      }).length;

      const unknownCount = local.arrivals.length - uptownCount - downtownCount;

      console.log(`   Direction breakdown: Uptown=${uptownCount}, Downtown=${downtownCount}, Unknown=${unknownCount}`);
    }
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                    DEEP ARRIVALS DEBUG                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  for (const issue of ISSUES) {
    await investigateIssue(issue);
  }

  await testMLineDirections();

  console.log('\n' + '═'.repeat(70));
  console.log('DEBUG COMPLETE');
  console.log('═'.repeat(70));
}

main().catch(console.error);
