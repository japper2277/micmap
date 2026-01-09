/**
 * Test: Comedy Shop → QED Astoria (requires transfer)
 */

const TRANSITER = 'https://demo.transiter.dev/systems/us-ny-subway';

async function getArrivals(stopId) {
  const res = await fetch(`${TRANSITER}/stops/${stopId}`);
  const data = await res.json();
  const now = Date.now() / 1000;

  return (data.stopTimes || [])
    .map(st => {
      const time = st.arrival?.time || st.departure?.time;
      if (!time) return null;
      const mins = Math.round((time - now) / 60);
      if (mins < 0 || mins > 30) return null;
      return {
        line: st.trip?.route?.id,
        dest: st.trip?.destination?.name || st.headsign,
        mins
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.mins - b.mins);
}

function pad(str, len) {
  return (str || '').substring(0, len).padEnd(len);
}

async function main() {
  console.log('\n🎤 Comedy Shop → QED Astoria');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Route: W 4 St (F/M) → Herald Sq → transfer N/W → 30 Av (Astoria)

  console.log('LEG 1: W 4 St → 34 St-Herald Sq (B/D/F/M)\n');
  const leg1 = await getArrivals('D20N');
  const bdfm = leg1.filter(a => ['B','D','F','M'].includes(a.line)).slice(0, 4);
  bdfm.forEach(a => {
    console.log('  ' + pad(a.line, 2) + ' → ' + pad(a.dest, 25) + ' ' + a.mins + ' min');
  });

  console.log('\n  📍 Transfer at Herald Sq (3 stops, ~5 min ride)\n');

  console.log('LEG 2: 34 St-Herald Sq → 30 Av Astoria (N/W)\n');
  const leg2 = await getArrivals('R17N'); // Herald Sq N/Q/R/W uptown
  const nw = leg2.filter(a => ['N','W'].includes(a.line)).slice(0, 4);
  nw.forEach(a => {
    console.log('  ' + pad(a.line, 2) + ' → ' + pad(a.dest, 25) + ' ' + a.mins + ' min');
  });

  console.log('\n  📍 30 Av is 8 stops (~15 min ride)\n');

  // What's at 30 Av now?
  console.log('VERIFY: Trains at 30 Av (QED\'s stop)\n');
  const dest = await getArrivals('R05');
  dest.slice(0, 4).forEach(a => {
    console.log('  ' + pad(a.line, 2) + ' → ' + pad(a.dest, 25) + ' ' + a.mins + ' min');
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Total: ~25-30 min (walk + ride + transfer + ride + walk)\n');
}

main().catch(console.error);
