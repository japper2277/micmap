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
  const webUrl = `${url.origin}/?mic=${micId}&web=1`;

  let ogTitle = 'Check out open mics on MicFinder';
  let ogDesc = 'Find open mics happening tonight in NYC';
  if (mic) {
    ogTitle = `${mic.name} – ${mic.day} ${mic.startTime}`;
    const venue = mic.venueName || mic.name;
    const cost = mic.cost === '$0' || mic.cost === 'Free' ? 'Free' : mic.cost;
    ogDesc = `${venue} · ${mic.neighborhood || mic.borough} · ${cost}${mic.stageTime ? ' · ' + mic.stageTime : ''}`;
  }

  let cardHtml;
  if (mic) {
    const time = esc(mic.startTime || '');
    const name = esc(mic.venueName || mic.name || '');
    const day = esc(mic.day || '');
    const address = esc(mic.address || '');
    const cost =
      mic.cost === '$0' || mic.cost === 'Free'
        ? 'Free'
        : esc(mic.cost || '');
    const stageTime = esc(mic.stageTime || '');

    cardHtml = `
      <div class="card">
        <div class="card-top">
          <span class="day-badge">${day}</span>
          <span class="time">${time}</span>
        </div>
        <div class="venue">${name}</div>
        ${address ? `<div class="location">${address}</div>` : ''}
        <div class="meta">
          ${stageTime ? `<span class="meta-item">${stageTime}</span>` : ''}
          ${stageTime && cost ? `<span class="meta-dot">&middot;</span>` : ''}
          ${cost ? `<span class="meta-item cost">${cost}</span>` : ''}
        </div>
      </div>`;
  } else {
    cardHtml = `
      <div class="card fallback">
        <div class="venue">Check out open mics on MicFinder</div>
        <div class="location">Find open mics happening tonight in NYC</div>
      </div>`;
  }

  return pageShell({
    ogTitle,
    ogDesc,
    canonical: `https://micfinder.io/?mic=${micId}`,
    cardHtml,
    webUrl,
    extraCss: '',
  });
}

// ─── Plan / "My Night" landing page ───────────────────────────

function buildPlanPage(mics, planIds, url) {
  const webUrl = `${url.origin}/?plan=${planIds}&web=1`;
  const stopCount = mics.length;
  // Simple hash: sum char codes of sorted plan string, mod to 12-char hex
  const sorted = planIds.split(',').sort().join(',');
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) hash = ((hash << 5) - hash + sorted.charCodeAt(i)) | 0;
  const planHash = Math.abs(hash).toString(16).padStart(8, '0').slice(0, 12);

  let ogTitle = 'My Night – MicFinder NYC';
  let ogDesc = `${stopCount} stop${stopCount !== 1 ? 's' : ''} tonight`;

  if (mics.length > 0) {
    const names = mics.map((m) => m.venueName || m.name).join(', ');
    ogDesc = `${stopCount} stop${stopCount !== 1 ? 's' : ''}: ${names}`;
  }

  // Build time range
  let timeRange = '';
  if (mics.length >= 2) {
    const first = mics[0]?.startTime || '';
    const last = mics[mics.length - 1]?.startTime || '';
    if (first && last) timeRange = `${first}–${last}`;
  } else if (mics.length === 1) {
    timeRange = mics[0]?.startTime || '';
  }

  // Build stop cards with response buttons
  const stopsHtml = mics
    .map((m) => {
      const micId = m._id || m.id;
      const time = esc(m.startTime || '');
      const name = esc(m.venueName || m.name || '');
      const hood = esc(m.neighborhood || '');
      const cost =
        m.cost === '$0' || m.cost === 'Free' ? 'Free' : esc(m.cost || '');
      const stageTime = esc(m.stageTime || '');
      const detail = [hood, cost].filter(Boolean).join(' · ');

      return `
      <div class="stop-card" data-mic="${esc(micId)}">
        <div class="stop-left">
          <div class="stop-time">${time}</div>
          ${stageTime ? `<div class="stop-stage">${stageTime}</div>` : ''}
        </div>
        <div class="stop-divider"></div>
        <div class="stop-right">
          <div class="stop-venue">${name}</div>
          ${detail ? `<div class="stop-detail">${detail}</div>` : ''}
          <div class="stop-stay">Stay <span class="stop-stay-val">${m.stayMins} min</span></div>
          <div class="rsvp-row">
            <button class="rsvp-btn rsvp-in" onclick="respond('${esc(micId)}','in',this)">I'm in</button>
            <button class="rsvp-btn rsvp-out" onclick="respond('${esc(micId)}','out',this)">Can't make it</button>
          </div>
          <div class="rsvp-names" id="rsvp-${esc(micId)}"></div>
        </div>
      </div>`;
    })
    .join('');

  const cardHtml = `
    <div class="plan-card" data-plan-hash="${planHash}">
      <div class="plan-header">
        <div>
          <div class="plan-title">My Night <span class="stops-badge">${stopCount} Stop${stopCount !== 1 ? 's' : ''}</span></div>
          ${timeRange ? `<div class="plan-range">${esc(timeRange)}</div>` : ''}
        </div>
      </div>
      <div class="stops-list">
        ${stopsHtml || '<div class="location">No stops found</div>'}
      </div>
    </div>`;

  const responseScript = `
  <script>
    var API='${API_BASE}',PH='${planHash}',userName=localStorage.getItem('mf_name')||'';
    function getName(cb){
      if(userName)return cb(userName);
      var row=document.createElement('div');
      row.className='name-prompt';
      row.innerHTML='<input class="name-input" placeholder="Your name" maxlength="20" autofocus/><button class="name-go" onclick="submitName(this)">Go</button>';
      document.querySelector('.plan-header').appendChild(row);
      row.querySelector('input').addEventListener('keydown',function(e){if(e.key==='Enter')submitName(row.querySelector('button'));});
      window._nameCb=cb;
    }
    function submitName(btn){
      var input=btn.parentElement.querySelector('input');
      var n=input.value.trim();
      if(!n)return input.focus();
      userName=n;localStorage.setItem('mf_name',n);
      btn.parentElement.remove();
      if(window._nameCb){window._nameCb(n);window._nameCb=null;}
    }
    function respond(micId,type,btn){
      getName(function(name){
        var card=btn.closest('.stop-card');
        card.querySelectorAll('.rsvp-btn').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
        fetch(API+'/api/v1/plans/'+PH+'/responses',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({name:name,micId:micId,response:type})
        }).then(function(r){return r.json();}).then(function(d){if(d.responses)renderAll(d.responses);});
      });
    }
    function renderAll(responses){
      document.querySelectorAll('.stop-card').forEach(function(card){
        var mid=card.dataset.mic;
        var el=card.querySelector('.rsvp-names');
        var mine=responses.filter(function(r){return r.micId===mid;});
        el.innerHTML=mine.map(function(r){
          return '<span class="rsvp-tag '+(r.response==='in'?'rsvp-tag-in':'rsvp-tag-out')+'">'+esc(r.name)+(r.response==='in'?' is in':' can\\'t make it')+'</span>';
        }).join('');
        // Restore my button state
        if(userName){
          var my=mine.find(function(r){return r.name===userName;});
          if(my){
            card.querySelectorAll('.rsvp-btn').forEach(function(b){b.classList.remove('active');});
            if(my.response==='in')card.querySelector('.rsvp-in').classList.add('active');
            else card.querySelector('.rsvp-out').classList.add('active');
          }
        }
      });
    }
    function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
    // Load existing responses on page load
    fetch(API+'/api/v1/plans/'+PH+'/responses').then(function(r){return r.json();}).then(function(d){if(d.responses)renderAll(d.responses);});
  <\\/script>`;

  return pageShell({
    ogTitle,
    ogDesc,
    canonical: `https://micfinder.io/?plan=${planIds}`,
    cardHtml: cardHtml + responseScript,
    webUrl,
    extraCss: PLAN_CSS,
  });
}

const PLAN_CSS = `
    .plan-card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      width: 100%;
      overflow: hidden;
    }
    .plan-header {
      padding: 20px 24px 16px;
    }
    .plan-title {
      font-size: 22px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .stops-badge {
      font-size: 13px;
      font-weight: 600;
      color: #4ade80;
      background: rgba(74,222,128,0.12);
      padding: 3px 10px;
      border-radius: 20px;
    }
    .plan-range {
      font-size: 15px;
      color: #71717a;
      margin-top: 4px;
    }
    .stops-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 0 12px 12px;
    }
    .stop-card {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      background: #1c1c1f;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 16px;
    }
    .stop-left {
      min-width: 52px;
      text-align: center;
      flex-shrink: 0;
    }
    .stop-time {
      font-size: 20px;
      font-weight: 700;
      color: #fff;
    }
    .stop-stage {
      font-size: 12px;
      color: #71717a;
      margin-top: 2px;
    }
    .stop-divider {
      width: 1px;
      align-self: stretch;
      background: #3f3f46;
      flex-shrink: 0;
    }
    .stop-right {
      flex: 1;
      min-width: 0;
    }
    .stop-venue {
      font-size: 16px;
      font-weight: 600;
      color: #fff;
    }
    .stop-detail {
      font-size: 14px;
      color: #a1a1aa;
      margin-top: 3px;
    }
    .stop-stay {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 8px;
      font-size: 13px;
      color: #71717a;
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 20px;
      padding: 4px 12px;
    }
    .stop-stay-val {
      color: #e4e4e7;
      font-weight: 600;
    }
    .rsvp-row {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }
    .rsvp-btn {
      flex: 1;
      padding: 8px 0;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      background: transparent;
      color: #a1a1aa;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .rsvp-btn:active { transform: scale(0.97); }
    .rsvp-in.active {
      background: rgba(74,222,128,0.15);
      border-color: #4ade80;
      color: #4ade80;
    }
    .rsvp-out.active {
      background: rgba(161,161,170,0.12);
      border-color: #71717a;
      color: #71717a;
    }
    .rsvp-names {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }
    .rsvp-tag {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 500;
    }
    .rsvp-tag-in {
      background: rgba(74,222,128,0.1);
      color: #4ade80;
    }
    .rsvp-tag-out {
      background: rgba(161,161,170,0.08);
      color: #71717a;
    }
    .name-prompt {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .name-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      background: #27272a;
      color: #fff;
      font-size: 14px;
      outline: none;
    }
    .name-input:focus { border-color: #3b82f6; }
    .name-go {
      padding: 8px 16px;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
`;

// ─── Shared page shell ─────────────────────────────────────────

function pageShell({ ogTitle, ogDesc, canonical, cardHtml, webUrl, extraCss }) {
  const ogImage = 'https://micfinder.io/images/og-default.png';

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
    <div class="actions">
      <a class="btn-app" href="${APP_STORE_URL}">Get the App</a>
      <a class="link-web" href="${esc(webUrl)}">Open in browser</a>
    </div>
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
