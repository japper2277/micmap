/**
 * Test: Transiter API - Comedy Shop to 34th St-Herald Sq
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
    .sort((a, b) => a.mins - b.mins)
    .slice(0, 6);
}

async function main() {
  console.log('\n🎤 Comedy Shop (167 Bleecker St)');
  console.log('📍 Nearest: W 4 St-Wash Sq (B/D/F/M)\n');
  console.log('🚇 Uptown to 34th St-Herald Sq:\n');

  const arrivals = await getArrivals('D20N'); // Uptown platform

  if (arrivals.length === 0) {
    console.log('  No trains in next 30 min');
  } else {
    arrivals.forEach(a => {
      const minsStr = a.mins === 0 ? 'NOW' : `${a.mins} min`;
      console.log(`  ${a.line.padEnd(2)} → ${a.dest.substring(0, 25).padEnd(25)} ${minsStr}`);
    });
  }

  console.log('\n✅ All 4 lines stop at 34th St (~5 min ride)\n');
}

main().catch(console.error);
