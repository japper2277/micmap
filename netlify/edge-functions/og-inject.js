const API_BASE = 'https://micmap-production.up.railway.app';
const APP_STORE_URL = 'https://apps.apple.com/app/id6758163082';

export default async function handler(request, context) {
  const url = new URL(request.url);
  const micId = url.searchParams.get('mic');
  const planIds = url.searchParams.get('plan');

  // No share params — passthrough
  if (!micId && !planIds) {
    return context.next();
  }

  // &web=1 escape hatch — passthrough to normal map app
  if (url.searchParams.get('web') === '1') {
    return context.next();
  }

  // Fetch all mics (shared by both modes)
  let allMics = [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${API_BASE}/api/v1/mics`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      allMics = data.mics || [];
    }
  } catch {
    // Timeout or network error — fall through to generic
  }

  if (planIds) {
    const entries = planIds.split(',').filter(Boolean);
    const stops = entries.map((entry) => {
      const [id, mins] = entry.split(':');
      const mic = allMics.find((m) => m._id === id || m.id === id);
      return mic ? { ...mic, stayMins: parseInt(mins, 10) || 45 } : null;
    }).filter(Boolean);
    // Sort stops chronologically
    stops.sort((a, b) => parseTimeTo24(a.startTime) - parseTimeTo24(b.startTime));

    // Fetch transit lines between consecutive stops (parallel, best-effort)
    await Promise.all(stops.slice(0, -1).map(async (stop, i) => {
      const next = stops[i + 1];
      const lat1 = stop.lat, lng1 = stop.lon || stop.lng;
      const lat2 = next.lat, lng2 = next.lon || next.lng;
      if (!lat1 || !lng1 || !lat2 || !lng2) return;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(
          `${API_BASE}/api/subway/routes?userLat=${lat1}&userLng=${lng1}&venueLat=${lat2}&venueLng=${lng2}&limit=1`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          const best = data.routes && data.routes[0];
          if (best && best.lines && best.lines.length > 0) {
            stop.transitLines = best.lines.slice(0, 3);
          }
        }
      } catch {
        // Timeout or error — leave transitLines empty, walk pill shows as fallback
      }
    }));

    return new Response(buildPlanPage(stops, planIds, url), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const mic = allMics.find((m) => m._id === micId || m.id === micId) || null;
  return new Response(buildMicPage(mic, micId, url), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

// ─── Single mic landing page ───────────────────────────────────

function buildMicPage(mic, micId, url) {
  let ogTitle = 'Check out open mics on MicFinder';
  let ogDesc = 'Find open mics happening tonight in NYC';
  let ogImage = 'https://micfinder.io/images/og-default.png';

  if (!mic) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(ogTitle)}</title><meta property="og:title" content="${esc(ogTitle)}"/><meta property="og:description" content="${esc(ogDesc)}"/><meta property="og:image" content="${ogImage}"/><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a0c;color:#ededed;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100dvh;text-align:center;padding:24px}.msg{font-size:18px;font-weight:700;color:#8b8b93}</style></head><body><div class="msg">Open mic not found</div></body></html>`;
  }

  const name = mic.venueName || mic.name || '';
  const time = mic.startTime || '';
  const hood = mic.neighborhood || mic.borough || '';
  const cost = formatCost(mic.cost);
  const stageTime = mic.stageTime || '';
  const address = mic.address || '';
  const lat = mic.lat || 40.72;
  const lng = mic.lon || mic.lng || -74.0;
  const dateInfo = getDateLabel(mic.day);

  ogTitle = `${name} \u2013 ${dateInfo.label} ${time}`;
  const metaParts = [hood, cost].filter(Boolean);
  if (stageTime) metaParts.push(`${stageTime} min sets`);
  ogDesc = metaParts.join(' \u00b7 ');

  const heroMapUrl = `${API_BASE}/api/static-map?lat=${lat}&lng=${lng}&zoom=15&w=1200&h=800`;
  ogImage = `${API_BASE}/api/static-map?lat=${lat}&lng=${lng}&zoom=15&w=1200&h=630`;

  const directionsUrl = `https://maps.google.com/maps?daddr=${lat},${lng}`;
  const shareText = encodeURIComponent(`${name} \u2013 ${dateInfo.label} ${time}\n${address}\nhttps://micfinder.io/?mic=${micId}`);
  const whatsappUrl = `https://wa.me/?text=${shareText}`;
  const imessageUrl = `sms:&body=${shareText}`;

  const calTitle = encodeURIComponent(`${name} Open Mic`);
  const calLocation = encodeURIComponent(address);
  const calDetails = encodeURIComponent(`Open mic at ${name}.${stageTime ? ' ' + stageTime + ' min sets.' : ''}${cost ? ' ' + cost + '.' : ''}\nhttps://micfinder.io/?mic=${micId}`);
  const calUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${calTitle}&location=${calLocation}&details=${calDetails}`;

  const locMeta = [hood, cost].filter(Boolean).join(' \u2022 ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
  <title>${esc(ogTitle)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(ogTitle)}" />
  <meta property="og:description" content="${esc(ogDesc)}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:url" content="https://micfinder.io/?mic=${micId}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(ogTitle)}" />
  <meta name="twitter:description" content="${esc(ogDesc)}" />
  <meta name="twitter:image" content="${ogImage}" />
  <meta name="apple-itunes-app" content="app-id=6758163082" />
  <style>${MIC_CSS}</style>
</head>
<body>
  <div class="hero-map" style="background-image:url('${heroMapUrl}')"></div>
  <div class="mic-canvas">
    <div class="mc-card">
      <div class="mc-header">
        <h1 class="mc-venue">${esc(name)}</h1>
        <div class="mc-header-right">
          <span class="mc-time-val">${esc(time)}</span>
          <button class="mc-join-btn" id="going-btn" onclick="markGoing()">+ Going</button>
        </div>
      </div>
      ${address ? `<div class="mc-address-row"><a href="${directionsUrl}" class="mc-addr-link" target="_blank" rel="noopener">${esc(address)} \u2192</a></div>` : hood ? `<div class="mc-address-row">${esc(hood)}, NYC</div>` : ''}
      <div class="mc-pills">
        ${cost ? `<span class="mc-pill${cost === 'Free' ? ' mc-pill-free' : ' mc-pill-cost'}">${esc(cost)}</span>` : ''}
        ${stageTime ? `<span class="mc-pill"><span class="mc-pill-icon">\u23F1</span>${esc(stageTime)}min</span>` : ''}
      </div>
      <div class="mc-roster" id="going-chips-row" style="display:none">
        <div class="going-chips" id="going-chips"></div>
      </div>
    </div>
  </div>
  <div class="dock">
    <div class="dock-container">
      <div class="going-chips-row" id="going-chips-row" style="display:none">
        <div class="going-chips" id="going-chips"></div>
      </div>
      <div id="state-default">
        <button class="btn-global-in" id="going-btn" onclick="markGoing()">I'm going tonight</button>
      </div>
      <div id="state-going" class="state-confirmed">
        <div class="confirmed-msg">\uD83C\uDF89 You're going!</div>
        <div class="global-actions">
          <a class="btn-share-msg" href="${imessageUrl}">\uD83D\uDCAC iMessage</a>
          <a class="btn-share-msg" href="${whatsappUrl}" target="_blank" rel="noopener">\uD83D\uDCDE WhatsApp</a>
        </div>
      </div>
      <div class="mic-links-row">
        <a href="${directionsUrl}" class="mic-link" target="_blank" rel="noopener">Get Directions \u2197</a>
        <span class="mic-link-sep">\u00b7</span>
        <a href="${calUrl}" class="mic-link" target="_blank" rel="noopener">Add to Calendar</a>
      </div>
    </div>
  </div>
  <script>
  var MIC_ID='${esc(micId)}',API='${API_BASE}';
  var gone=localStorage.getItem('mf_going_'+MIC_ID)==='1';
  if(gone)showGoing();

  function markGoing(){
    if(gone)return;
    gone=true;
    localStorage.setItem('mf_going_'+MIC_ID,'1');
    var btn=document.getElementById('going-btn');
    if(btn){btn.textContent='\u2713 Going';btn.classList.add('active');}
    showGoing();
    fetch(API+'/api/v1/mics/'+MIC_ID+'/going',{method:'POST'})
      .then(function(r){return r.json();})
      .then(function(d){if(d.count)updateChips(d.count);});
  }
  function showGoing(){
    var def=document.getElementById('state-default');
    var going=document.getElementById('state-going');
    if(def)def.style.display='none';
    if(going)going.style.display='flex';
  }
  function updateChips(count){
    if(count<2)return;
    var row=document.getElementById('going-chips-row');
    var chips=document.getElementById('going-chips');
    if(!row||!chips)return;
    row.style.display='block';
    chips.innerHTML='<span class="going-chip">'+(count-1)+' other'+(count>2?'s':'')+' going</span>';
  }
  fetch(API+'/api/v1/mics/'+MIC_ID+'/going')
    .then(function(r){return r.json();})
    .then(function(d){if(d.count)updateChips(d.count);});
  <\/script>
</body>
</html>`;
}

const MIC_CSS = `
  :root {
    --bg-page: #0a0a0c;
    --bg-card: #141417;
    --border-soft: rgba(255,255,255,0.08);
    --border-med: rgba(255,255,255,0.15);
    --text-pure: #ffffff;
    --text-primary: #ededed;
    --text-muted: #8b8b93;
    --accent-green: #22c55e;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg-page);
    color: var(--text-primary);
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif;
    padding-bottom: 180px;
    -webkit-font-smoothing: antialiased;
    min-height: 100dvh;
    position: relative;
  }

  /* Hero map */
  .hero-map {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 320px;
    background-size: cover;
    background-position: center;
    background-color: #1a1a1f;
    z-index: 0;
    opacity: 0.65;
  }
  .hero-map::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgba(10,10,12,0.1) 0%, rgba(10,10,12,0.85) 55%, var(--bg-page) 100%);
  }

  /* Content */
  .mic-canvas {
    max-width: 480px;
    margin: 0 auto;
    padding: 0 20px;
    position: relative;
    z-index: 10;
    padding-top: 200px;
  }
  .mc-card {
    background: var(--bg-card);
    border: 1px solid var(--border-soft);
    border-radius: 20px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 0;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  .mc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 10px;
  }
  .mc-venue {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-pure);
    letter-spacing: -0.3px;
    line-height: 1.2;
    flex: 1;
    min-width: 0;
  }
  .mc-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .mc-time-val {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-pure);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .mc-join-btn {
    background: rgba(255,255,255,0.08);
    border: 1px solid var(--border-med);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 700;
    padding: 6px 12px;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    font-family: inherit;
    -webkit-tap-highlight-color: transparent;
  }
  .mc-join-btn:active { transform: scale(0.95); }
  .mc-join-btn.active {
    background: rgba(34,197,94,0.15);
    border-color: rgba(34,197,94,0.3);
    color: var(--accent-green);
  }
  .mc-address-row {
    font-size: 13px;
    color: var(--text-muted);
    font-weight: 500;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .mc-addr-link { color: #3b82f6; text-decoration: none; }
  .mc-addr-link:active { opacity: 0.7; }
  .mc-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 0;
  }
  .mc-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 20px;
    background: rgba(255,255,255,0.07);
    color: var(--text-muted);
    border: 1px solid var(--border-soft);
  }
  .mc-pill-free { background: rgba(34,197,94,0.12); color: var(--accent-green); border-color: rgba(34,197,94,0.2); }
  .mc-pill-cost { background: rgba(34,197,94,0.12); color: var(--accent-green); border-color: rgba(34,197,94,0.2); }
  .mc-pill-day { }
  .mc-pill-icon { font-size: 11px; }
  .mc-roster {
    padding-top: 10px;
    border-top: 1px solid var(--border-soft);
    margin-top: 12px;
  }

  /* Dock */
  .dock {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    background: rgba(15,15,18,0.92);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-top: 1px solid var(--border-med);
    padding: 16px 20px max(16px, env(safe-area-inset-bottom));
    z-index: 100;
  }
  .dock-container {
    max-width: 480px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Going chips */
  .going-chips-row { margin-bottom: 0; }
  .going-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .going-chip {
    background: rgba(255,255,255,0.08);
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 20px;
  }

  /* Primary button */
  #state-default { display: flex; }
  .btn-global-in {
    flex: 1;
    background: var(--text-pure);
    color: #000;
    border: none;
    padding: 16px;
    border-radius: 16px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s;
    text-align: center;
    font-family: inherit;
    -webkit-tap-highlight-color: transparent;
  }
  .btn-global-in:active { transform: scale(0.98); }

  /* Confirmed state */
  .state-confirmed {
    display: none;
    flex-direction: column;
    gap: 12px;
    animation: slideUp 0.3s ease;
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .confirmed-msg {
    font-size: 17px;
    font-weight: 700;
    color: var(--accent-green);
    text-align: center;
  }
  .global-actions { display: flex; gap: 10px; }
  .btn-share-msg {
    flex: 1;
    background: rgba(255,255,255,0.08);
    border: 1px solid var(--border-med);
    color: var(--text-pure);
    border-radius: 16px;
    padding: 15px;
    font-size: 15px;
    font-weight: 700;
    text-decoration: none;
    text-align: center;
    transition: transform 0.15s, background 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .btn-share-msg:active { transform: scale(0.97); background: rgba(255,255,255,0.15); }

  /* Links row */
  .mic-links-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  .mic-link {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    text-decoration: none;
  }
  .mic-link:active { color: var(--text-pure); }
  .mic-link-sep { color: #3a3a40; font-size: 13px; }
`;

// ─── Plan helpers ─────────────────────────────────────────────

function parseTimeTo24(timeStr) {
  if (!timeStr) return 0;
  const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?/i);
  if (!match) return 0;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2] || '0', 10);
  const period = (match[3] || '').toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  let mins = h * 60 + m;
  // Late night 12AM-4AM sorts after 11PM
  if (mins < 240) mins += 1440;
  return mins;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatCost(raw) {
  if (!raw) return '';
  if (raw === '$0' || raw.toLowerCase() === 'free') return 'Free';
  const m = raw.match(/^\$(\d+)\.\d+$/);
  if (m) return '$' + m[1];
  return raw;
}

function getDateLabel(dayStr) {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const todayIdx = now.getDay();
  const todayName = days[todayIdx];
  const formatted = `${days[todayIdx]}, ${months[now.getMonth()]} ${now.getDate()}`;

  if (!dayStr) return { label: 'Tonight', sub: formatted };
  const normalized = dayStr.charAt(0).toUpperCase() + dayStr.slice(1).toLowerCase();
  if (normalized === todayName) return { label: 'Tonight', sub: formatted };

  const tmrwIdx = (todayIdx + 1) % 7;
  if (normalized === days[tmrwIdx]) {
    const tmrw = new Date(now);
    tmrw.setDate(tmrw.getDate() + 1);
    return { label: 'Tomorrow Night', sub: `${days[tmrwIdx]}, ${months[tmrw.getMonth()]} ${tmrw.getDate()}` };
  }

  const targetIdx = days.indexOf(normalized);
  if (targetIdx >= 0) {
    let diff = (targetIdx - todayIdx + 7) % 7;
    if (diff === 0) diff = 7;
    const target = new Date(now);
    target.setDate(target.getDate() + diff);
    return { label: `${normalized} Night`, sub: `${normalized}, ${months[target.getMonth()]} ${target.getDate()}` };
  }

  return { label: `${normalized} Night`, sub: normalized };
}

function walkMinutes(lat1, lon1, lat2, lon2) {
  const miles = haversine(lat1, lon1, lat2, lon2);
  return Math.round(miles * 1.4 * 20);
}

// ─── Plan / "My Night" landing page ───────────────────────────

function buildPlanPage(mics, planIds, url) {
  const stopCount = mics.length;

  // Plan hash (deterministic from sorted plan IDs)
  const sorted = planIds.split(',').sort().join(',');
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) hash = ((hash << 5) - hash + sorted.charCodeAt(i)) | 0;
  const planHash = Math.abs(hash).toString(16).padStart(8, '0').slice(0, 12);

  // Date label
  const dateInfo = getDateLabel(mics[0]?.day);

  // First stop time
  const firstTime = mics[0]?.startTime || '';

  // OG meta
  const names = mics.map((m) => m.venueName || m.name);
  const ogTitle = `${dateInfo.label} \u2013 MicFinder NYC`;
  const ogDesc = `${dateInfo.label}: ${stopCount} stop${stopCount !== 1 ? 's' : ''} \u2013 ${names.join(' > ')}`;

  // Hero map + OG image URL
  const coordStops = mics.filter(m => m.lat && (m.lon || m.lng));
  let ogImage = 'https://micfinder.io/images/og-default.png';
  let heroMapUrl = '';
  if (coordStops.length > 0) {
    const markers = coordStops.map(m => `${m.lat},${m.lon || m.lng}`).join('|');
    ogImage = `${API_BASE}/api/static-map?markers=${encodeURIComponent(markers)}&w=1200&h=630`;
    heroMapUrl = `${API_BASE}/api/static-map?markers=${encodeURIComponent(markers)}&w=1200&h=800`;
  }

  // Plan title — neighborhood-based
  const hoods = [...new Set(mics.map(m => m.neighborhood).filter(Boolean))];
  let planTitle;
  if (hoods.length === 1) {
    planTitle = `The ${esc(hoods[0])} Run`;
  } else if (hoods.length === 2) {
    planTitle = `The ${esc(hoods[0])} &amp; ${esc(hoods[1])} Run`;
  } else {
    planTitle = dateInfo.label === 'Tonight' ? "Tonight's Run" : `${esc(dateInfo.label)}'s Run`;
  }

  // Cost range for subtitle
  const allCosts = mics.map(m => formatCost(m.cost)).filter(Boolean);
  const hasFree = allCosts.some(c => c === 'Free');
  const paidCosts = allCosts.filter(c => c !== 'Free');
  let costStr = '';
  if (allCosts.length > 0) {
    if (hasFree && paidCosts.length === 0) {
      costStr = 'Free';
    } else if (hasFree) {
      const amounts = paidCosts.map(c => parseInt(c.replace('$', ''))).filter(n => !isNaN(n));
      costStr = amounts.length ? `Free\u2013$${Math.max(...amounts)}` : 'Free';
    } else {
      const amounts = paidCosts.map(c => parseInt(c.replace('$', ''))).filter(n => !isNaN(n));
      if (amounts.length) {
        const mn = Math.min(...amounts), mx = Math.max(...amounts);
        costStr = mn === mx ? `$${mn}` : `$${mn}\u2013$${mx}`;
      }
    }
  }

  // Subtitle
  const subtitleParts = [`${stopCount} Mic${stopCount !== 1 ? 's' : ''}`];
  if (costStr) subtitleParts.push(costStr);
  if (firstTime) subtitleParts.push(`${firstTime} Start`);
  const subtitleLine = esc(subtitleParts.join(' \u2022 '));

  // Share URLs
  const shareText = encodeURIComponent(`${dateInfo.label}: ${names.join(' \u2192 ')}\nhttps://micfinder.io/?plan=${planIds}`);
  const whatsappUrl = `https://wa.me/?text=${shareText}`;
  const imessageUrl = `sms:&body=${shareText}`;

  // Timeline HTML — nodes interleaved with transit dividers
  const timelineHtml = mics.map((m, i) => {
    const micId = m._id || m.id;
    const time = m.startTime || '';
    const name = m.venueName || m.name || '';
    const hood = m.neighborhood || m.borough || '';
    const cost = formatCost(m.cost);
    const lat = m.lat;
    const lng = m.lon || m.lng;
    const directionsUrl = lat && lng ? `https://maps.google.com/maps?daddr=${lat},${lng}` : '';
    const locParts = [hood, cost].filter(Boolean);
    const locLine = locParts.join(' \u2022 ');

    let transitHtml = '';
    if (i < mics.length - 1) {
      const next = mics[i + 1];
      const nLat = next.lat;
      const nLng = next.lon || next.lng;
      let transitIcon = '\uD83D\uDEB6'; // 🚶
      let transitLabel = 'Next stop';
      let subwayLines = (m.transitLines || []);
      if (lat && lng && nLat && nLng) {
        const mins = walkMinutes(lat, lng, nLat, nLng);
        if (mins > 12) {
          transitIcon = '\uD83D\uDE87'; // 🚇
          transitLabel = `${mins} min via`;
        } else {
          transitLabel = `${mins} min walk`;
        }
      }
      const lineColors = {
        '1':'#EE352E','2':'#EE352E','3':'#EE352E',
        '4':'#00933C','5':'#00933C','6':'#00933C',
        '7':'#B933AD','A':'#0039A6','C':'#0039A6','E':'#0039A6',
        'B':'#FF6319','D':'#FF6319','F':'#FF6319','M':'#FF6319',
        'G':'#6CBE45','J':'#996633','Z':'#996633','L':'#A7A9AC',
        'N':'#FCCC0A','Q':'#FCCC0A','R':'#FCCC0A','W':'#FCCC0A',
      };
      const lineBadges = subwayLines.map(line => {
        const color = lineColors[line] || '#555';
        const textColor = (line === 'N' || line === 'Q' || line === 'R' || line === 'W') ? '#000' : '#fff';
        return `<span class="subway-circle" style="background:${color};color:${textColor}">${esc(line)}</span>`;
      }).join('');
      transitHtml = `
    <div class="transit-divider">
      <div class="t-icon">${transitIcon}</div>
      <div class="t-pill">${esc(transitLabel)}${lineBadges}</div>
    </div>`;
    }

    const stageTime = m.stageTime || '';
    const address = m.address || '';
    const addrDisplay = address || (hood ? `${hood}, NYC` : '');

    // Build pills: cost, stage time, transit (added to next stop below)
    const pillsHtml = [
      cost ? `<span class="nc-pill${cost === 'Free' ? ' nc-pill-free' : ' nc-pill-cost'}">${esc(cost)}</span>` : '',
      stageTime ? `<span class="nc-pill"><span class="nc-pill-icon">\u23F1</span>${esc(stageTime)}min</span>` : '',
    ].filter(Boolean).join('');

    return `
    <div class="node" id="node-${esc(micId)}" data-mic="${esc(micId)}">
      <div class="node-num">
        <div class="num-circle">${i + 1}</div>
      </div>
      <div class="node-card">
        <div class="nc-header">
          <div class="nc-venue">${esc(name)}</div>
          <div class="nc-header-right">
            <span class="nc-time">${esc(time)}</span>
            <button class="btn-toggle" onclick="toggleRespond('${esc(micId)}',this)">+ Join</button>
          </div>
        </div>
        ${addrDisplay ? `<div class="nc-address">${directionsUrl ? `<a href="${directionsUrl}" class="nc-addr-link" target="_blank" rel="noopener">${esc(addrDisplay)} \u2192</a>` : esc(addrDisplay)}</div>` : ''}
        ${pillsHtml ? `<div class="nc-pills">${pillsHtml}</div>` : ''}
        <div class="nc-roster" id="roster-${esc(micId)}"></div>
      </div>
    </div>${transitHtml}`;
  }).join('');

  // Response + interaction script
  const responseScript = `<script>
  var API='${API_BASE}',PH='${planHash}',userName=localStorage.getItem('mf_name')||'',allMicIds=${JSON.stringify(mics.map(m => m._id || m.id))};

  function getName(cb){
    if(userName)return cb(userName);
    var overlay=document.createElement('div');
    overlay.className='name-overlay';
    overlay.innerHTML='<div class="name-modal"><div class="name-modal-title">What\\'s your name?</div><input class="name-input" placeholder="Your name" maxlength="20" autofocus/><button class="name-go" onclick="submitName(this)">Let\\'s go</button></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('input').addEventListener('keydown',function(e){if(e.key==='Enter')submitName(overlay.querySelector('button'));});
    window._nameCb=cb;
  }
  function submitName(btn){
    var overlay=btn.closest('.name-overlay');
    var input=overlay.querySelector('input');
    var n=input.value.trim();
    if(!n)return input.focus();
    userName=n;localStorage.setItem('mf_name',n);
    overlay.remove();
    if(window._nameCb){window._nameCb(n);window._nameCb=null;}
  }

  function toggleRespond(micId,btn){
    var node=document.getElementById('node-'+micId);
    var isIn=node&&node.classList.contains('is-joined');
    respond(micId,isIn?'out':'in',btn);
  }
  function respond(micId,type,btn){
    getName(function(name){
      var node=document.getElementById('node-'+micId);
      var tgl=node&&node.querySelector('.btn-toggle');
      if(type==='in'){
        if(node)node.classList.add('is-joined');
        if(tgl)tgl.innerHTML='\u2713 In';
      } else {
        if(node)node.classList.remove('is-joined');
        if(tgl)tgl.innerHTML='+ Join';
      }
      fetch(API+'/api/v1/plans/'+PH+'/responses',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:name,micId:micId,response:type})
      }).then(function(r){return r.json();}).then(function(d){if(d.responses)renderAll(d.responses);});
    });
  }
  function rsvpAll(type){
    getName(function(name){
      var promises=allMicIds.map(function(micId){
        return fetch(API+'/api/v1/plans/'+PH+'/responses',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({name:name,micId:micId,response:type})
        }).then(function(r){return r.json();});
      });
      Promise.all(promises).then(function(results){
        allMicIds.forEach(function(micId){
          var node=document.getElementById('node-'+micId);
          if(node){node.classList.add('is-joined');var tgl=node.querySelector('.btn-toggle');if(tgl)tgl.innerHTML='\u2713 In';}
        });
        var last=results[results.length-1];
        if(last&&last.responses)renderAll(last.responses);
        showConfirmed();
      });
    });
  }
  function showConfirmed(){
    var d=document.getElementById('state-decision');
    var c=document.getElementById('state-confirmed');
    if(d)d.style.display='none';
    if(c)c.style.display='flex';
  }
  function renderAll(responses){
    document.querySelectorAll('.node[data-mic]').forEach(function(node){
      var mid=node.dataset.mic;
      var roster=document.getElementById('roster-'+mid);
      if(!roster)return;
      roster.querySelectorAll('.mini-chip').forEach(function(c){c.remove();});
      var inPeople=responses.filter(function(r){return r.micId===mid&&r.response==='in';});
      inPeople.forEach(function(r){
        var chip=document.createElement('div');chip.className='mini-chip';chip.textContent=r.name;roster.appendChild(chip);
      });
      if(inPeople.length>0){roster.classList.add('has-chips');}else{roster.classList.remove('has-chips');}
      if(userName){
        var myR=responses.find(function(r){return r.micId===mid&&r.name===userName;});
        var tgl=node.querySelector('.btn-toggle');
        if(myR&&myR.response==='in'){node.classList.add('is-joined');if(tgl)tgl.innerHTML='\u2713 In';}
        else if(myR&&myR.response==='out'){node.classList.remove('is-joined');if(tgl)tgl.innerHTML='+ Join';}
      }
    });
    // Going chips in dock
    var byName={};
    responses.forEach(function(r){if(r.response==='in')byName[r.name]=true;});
    var inPeople=Object.keys(byName);
    var chipsRow=document.getElementById('going-chips-row');
    var chipsEl=document.getElementById('going-chips');
    if(inPeople.length>0&&chipsRow){
      chipsRow.style.display='block';
      chipsEl.innerHTML=inPeople.map(function(n){
        var isMe=n===userName;
        return '<span class="going-chip'+(isMe?' you':'')+'">'+ esc(n)+'</span>';
      }).join('');
    }
    // Auto-show confirmed if current user already RSVP'd all stops
    if(userName){
      var allIn=allMicIds.every(function(id){
        return responses.some(function(r){return r.micId===id&&r.name===userName&&r.response==='in';});
      });
      if(allIn)showConfirmed();
    }
  }
  function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
  // Load existing responses on page load
  fetch(API+'/api/v1/plans/'+PH+'/responses').then(function(r){return r.json();}).then(function(d){if(d.responses)renderAll(d.responses);});
<\/script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
  <title>${esc(ogTitle)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(ogTitle)}" />
  <meta property="og:description" content="${esc(ogDesc)}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:url" content="https://micfinder.io/?plan=${planIds}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(ogTitle)}" />
  <meta name="twitter:description" content="${esc(ogDesc)}" />
  <meta name="twitter:image" content="${ogImage}" />
  <meta name="apple-itunes-app" content="app-id=6758163082" />
  <style>${PLAN_CSS}</style>
</head>
<body>
  <div class="hero-map"${heroMapUrl ? ` style="background-image:url('${heroMapUrl}')"` : ''}></div>
  <div class="plan-canvas">
    <div class="header-stack">
      <span class="badge">${esc(dateInfo.label)}</span>
      <h1 class="title">${planTitle}</h1>
      <span class="subtitle">${subtitleLine}</span>
    </div>
    <div class="timeline">
      ${timelineHtml || '<div style="color:#636366;padding:32px;text-align:center">No stops found</div>'}
    </div>
  </div>
  <div class="dock">
    <div class="dock-container">
      <div class="going-chips-row" id="going-chips-row" style="display:none">
        <div class="going-chips" id="going-chips"></div>
      </div>
      <div id="state-decision">
        <div class="global-actions">
          <button class="btn-global-in" onclick="rsvpAll('in')">I'm in for the whole night</button>
        </div>
      </div>
      <div id="state-confirmed" class="state-confirmed">
        <div class="confirmed-msg">\uD83C\uDF89 You're officially locked in.</div>
        <div class="global-actions">
          <a class="btn-share-msg" href="${imessageUrl}">\uD83D\uDCAC iMessage</a>
          <a class="btn-share-msg" href="${whatsappUrl}" target="_blank" rel="noopener">\uD83D\uDCDE WhatsApp</a>
        </div>
      </div>
    </div>
  </div>
  ${responseScript}
</body>
</html>`;
}

const PLAN_CSS = `
  :root {
    --bg-page: #0a0a0c;
    --bg-card: #141417;
    --border-soft: rgba(255,255,255,0.08);
    --border-med: rgba(255,255,255,0.15);
    --text-pure: #ffffff;
    --text-primary: #ededed;
    --text-muted: #8b8b93;
    --accent-green: #22c55e;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg-page);
    color: var(--text-primary);
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif;
    padding-bottom: 160px;
    -webkit-font-smoothing: antialiased;
    min-height: 100dvh;
    position: relative;
  }

  /* Hero map background */
  .hero-map {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 340px;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    background-color: #1a1a1f;
    z-index: 0;
    opacity: 0.7;
  }
  .hero-map::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgba(10,10,12,0.1) 0%, rgba(10,10,12,0.9) 60%, var(--bg-page) 100%);
  }

  /* Main content */
  .plan-canvas {
    max-width: 480px;
    margin: 0 auto;
    padding: 0 20px;
    position: relative;
    z-index: 10;
    padding-top: 160px;
  }

  /* Header */
  .header-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin-bottom: 32px;
    text-align: center;
  }
  .badge {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--accent-green);
    background: rgba(34,197,94,0.15);
    padding: 4px 10px;
    border-radius: 20px;
    margin-bottom: 8px;
  }
  .title {
    font-size: 34px;
    font-weight: 800;
    color: var(--text-pure);
    letter-spacing: -1px;
    line-height: 1.1;
  }
  .subtitle {
    font-size: 15px;
    color: var(--text-muted);
    font-weight: 500;
    margin-top: 4px;
  }

  /* Timeline */
  .timeline {
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .timeline::before {
    content: '';
    position: absolute;
    left: 15px;
    top: 16px;
    bottom: 56px;
    width: 2px;
    background: linear-gradient(to bottom, var(--border-med) 0%, transparent 100%);
    z-index: 0;
  }

  /* Node */
  .node {
    display: flex;
    align-items: stretch;
    gap: 16px;
    position: relative;
    z-index: 1;
  }
  .node-num {
    width: 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
    padding-top: 16px;
  }
  .num-circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--bg-card);
    border: 2px solid var(--border-med);
    color: var(--text-pure);
    font-size: 14px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 0 5px var(--bg-page);
    transition: background 0.2s, border-color 0.2s;
  }
  .node.is-joined .num-circle {
    background: var(--accent-green);
    border-color: var(--accent-green);
    color: #000;
  }
  .node-card {
    flex: 1;
    background: var(--bg-card);
    border: 1px solid var(--border-soft);
    border-radius: 16px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-bottom: 8px;
    transition: border-color 0.2s;
  }
  .node.is-joined .node-card {
    border-color: rgba(34,197,94,0.25);
  }

  /* Card content */
  .nc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 8px;
  }
  .nc-venue {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-pure);
    letter-spacing: -0.2px;
    line-height: 1.25;
    flex: 1;
    min-width: 0;
  }
  .nc-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .nc-time {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-pure);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* Join toggle */
  .btn-toggle {
    background: rgba(255,255,255,0.08);
    border: 1px solid var(--border-med);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 700;
    padding: 6px 12px;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    flex-shrink: 0;
    font-family: inherit;
    -webkit-tap-highlight-color: transparent;
  }
  .btn-toggle:active { transform: scale(0.95); }
  .node.is-joined .btn-toggle {
    background: rgba(34,197,94,0.15);
    border-color: rgba(34,197,94,0.3);
    color: var(--accent-green);
  }

  /* Address row */
  .nc-address {
    font-size: 13px;
    color: var(--text-muted);
    font-weight: 500;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .nc-addr-link {
    color: #3b82f6;
    text-decoration: none;
  }
  .nc-addr-link:active { opacity: 0.7; }

  /* Pills */
  .nc-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }
  .nc-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 20px;
    background: rgba(255,255,255,0.07);
    color: var(--text-muted);
    border: 1px solid var(--border-soft);
  }
  .nc-pill-free { background: rgba(34,197,94,0.12); color: var(--accent-green); border-color: rgba(34,197,94,0.2); }
  .nc-pill-cost { background: rgba(34,197,94,0.12); color: var(--accent-green); border-color: rgba(34,197,94,0.2); }
  .nc-pill-icon { font-size: 11px; }

  /* Roster row — hidden until chips added via JS */
  .nc-roster { display: none; }
  .nc-roster.has-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    padding-top: 10px;
    border-top: 1px solid var(--border-soft);
    margin-top: 10px;
  }
  .mini-chip {
    background: rgba(255,255,255,0.06);
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 8px;
  }

  /* Transit divider */
  .transit-divider {
    display: flex;
    align-items: center;
    margin-left: 8px;
    gap: 10px;
    position: relative;
    z-index: 1;
    padding: 6px 0;
  }
  .t-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    background: var(--bg-page);
    flex-shrink: 0;
  }
  .t-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    background: #1e1e22;
    padding: 6px 14px;
    border-radius: 99px;
    border: 1px solid var(--border-soft);
    white-space: nowrap;
  }
  .subway-circle {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* Sticky dock */
  .dock {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    background: rgba(15,15,18,0.92);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-top: 1px solid var(--border-med);
    padding: 16px 20px max(16px, env(safe-area-inset-bottom));
    z-index: 100;
  }
  .dock-container {
    max-width: 480px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Social proof */
  .social-proof {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .avatars { display: flex; }
  .avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid #0f0f12;
    margin-left: -8px;
    background: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    color: #fff;
  }
  .sp-text {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
    margin-left: 4px;
  }

  /* Going chips in dock */
  .going-chips-row {
    margin-bottom: 4px;
  }
  .going-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .going-chip {
    background: rgba(255,255,255,0.08);
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 20px;
  }
  .going-chip.you {
    background: rgba(34,197,94,0.15);
    color: var(--accent-green);
  }

  /* Decision state */
  #state-decision { display: flex; flex-direction: column; gap: 10px; }
  .global-actions { display: flex; gap: 10px; }
  .btn-global-in {
    flex: 1;
    background: var(--text-pure);
    color: #000;
    border: none;
    padding: 16px;
    border-radius: 16px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s;
    text-align: center;
    font-family: inherit;
    -webkit-tap-highlight-color: transparent;
    box-shadow: 0 4px 12px rgba(255,255,255,0.1);
  }
  .btn-global-in:active { transform: scale(0.98); }

  /* Confirmed state */
  .state-confirmed {
    display: none;
    flex-direction: column;
    gap: 12px;
    animation: slideUp 0.3s ease;
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .confirmed-msg {
    font-size: 17px;
    font-weight: 700;
    color: var(--accent-green);
    text-align: center;
    letter-spacing: -0.01em;
  }
  .btn-share-msg {
    flex: 1;
    background: rgba(255,255,255,0.08);
    border: 1px solid var(--border-med);
    color: var(--text-pure);
    border-radius: 16px;
    padding: 15px;
    font-size: 15px;
    font-weight: 700;
    text-decoration: none;
    text-align: center;
    transition: transform 0.15s, background 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .btn-share-msg:active { transform: scale(0.97); background: rgba(255,255,255,0.15); }

  /* Name modal */
  .name-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.75);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 24px;
  }
  .name-modal {
    background: var(--bg-card);
    border: 1px solid var(--border-med);
    border-radius: 20px;
    padding: 28px 24px;
    width: 100%;
    max-width: 320px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.6);
  }
  .name-modal-title {
    font-size: 20px;
    font-weight: 800;
    margin-bottom: 16px;
    text-align: center;
    color: var(--text-pure);
  }
  .name-input {
    width: 100%;
    height: 48px;
    background: rgba(255,255,255,0.05);
    border: 1.5px solid var(--border-med);
    border-radius: 12px;
    color: #fff;
    font-size: 15px;
    font-weight: 500;
    padding: 0 16px;
    outline: none;
    font-family: inherit;
    margin-bottom: 12px;
    transition: border-color 0.2s;
  }
  .name-input::placeholder { color: var(--text-muted); }
  .name-input:focus { border-color: var(--accent-green); box-shadow: 0 0 0 3px rgba(34,197,94,0.15); }
  .name-go {
    width: 100%;
    height: 48px;
    background: var(--accent-green);
    color: #000;
    border: none;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 800;
    cursor: pointer;
    font-family: inherit;
    transition: transform 0.1s;
  }
  .name-go:active { transform: scale(0.97); }
`;

// ─── Shared page shell ─────────────────────────────────────────

function pageShell({ ogTitle, ogDesc, canonical, cardHtml, webUrl, extraCss, ogImage: customOgImage, hideActions }) {
  const ogImage = customOgImage || 'https://micfinder.io/images/og-default.png';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(ogTitle)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(ogTitle)}" />
  <meta property="og:description" content="${esc(ogDesc)}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:url" content="${canonical}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(ogTitle)}" />
  <meta name="twitter:description" content="${esc(ogDesc)}" />
  <meta name="twitter:image" content="${ogImage}" />
  <meta name="apple-itunes-app" content="app-id=6758163082" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0a;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
    }
    .container {
      max-width: 400px;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 32px;
    }
    .header {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .logo {
      width: 56px;
      height: 56px;
      border-radius: 14px;
    }
    .app-name {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      padding: 24px;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .card.fallback { text-align: center; padding: 32px 24px; }
    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .day-badge {
      font-size: 13px;
      font-weight: 600;
      color: #a1a1aa;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .time {
      color: #ff9500;
      font-size: 20px;
      font-weight: 700;
    }
    .venue {
      font-size: 24px;
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: -0.02em;
    }
    .location {
      font-size: 15px;
      color: #71717a;
    }
    .meta {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .meta-item {
      font-size: 14px;
      color: #a1a1aa;
    }
    .meta-item.cost {
      color: #4ade80;
      font-weight: 600;
    }
    .meta-dot {
      color: #3f3f46;
    }
    .actions {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .btn-app {
      display: block;
      width: 100%;
      padding: 14px;
      background: #3b82f6;
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      text-align: center;
      text-decoration: none;
      border-radius: 12px;
      transition: opacity 0.15s;
    }
    .btn-app:active { opacity: 0.85; }
    .link-web {
      color: #71717a;
      font-size: 14px;
      text-decoration: none;
    }
    .link-web:hover { color: #a1a1aa; }
    ${extraCss}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img class="logo" src="https://micfinder.io/images/app-icon.png" alt="MicFinder" onerror="this.style.display='none'" />
      <div class="app-name">MicFinder NYC</div>
    </div>
    ${cardHtml}
    ${hideActions ? '' : `<div class="actions">
      <a class="btn-app" href="${APP_STORE_URL}">Get the App</a>
      <a class="link-web" href="${esc(webUrl)}">Open in browser</a>
    </div>`}
  </div>
</body>
</html>`;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const config = { path: '/' };
