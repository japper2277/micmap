/* =================================================================
   PLANNER
   Map-first route planning - click markers to build route
   ================================================================= */

// Add mic to route
function addToRoute(micId) {
    if (STATE.route.includes(micId)) return;

    STATE.route.push(micId);

    // Sort by start time
    STATE.route.sort((a, b) => {
        const micA = STATE.mics.find(m => m.id === a);
        const micB = STATE.mics.find(m => m.id === b);
        if (!micA || !micB) return 0;
        return micA.start - micB.start;
    });

    updateMarkerStates();
    updateRouteLine();
    renderPlanDrawer();
}

// Remove mic from route
function removeFromRoute(micId) {
    STATE.route = STATE.route.filter(id => id !== micId);
    updateMarkerStates();
    updateRouteLine();
    renderPlanDrawer();
}

// Toggle mic in/out of route (called when marker clicked in plan mode)
function toggleMicInRoute(micId) {
    if (!STATE.planMode) return;

    if (STATE.route.includes(micId)) {
        removeFromRoute(micId);
    } else {
        addToRoute(micId);
    }
}

// Update marker visual states based on route
function updateMarkerStates() {
    // Placeholder - will be implemented in step 3.4
    console.log('updateMarkerStates called, route:', STATE.route);
}

// Update route line on map
function updateRouteLine() {
    // Placeholder - will be implemented in phase 5
    console.log('updateRouteLine called, route:', STATE.route);
}

// Render drawer content for plan mode
function renderPlanDrawer() {
    const container = document.getElementById('list-content');
    if (!container) return;

    if (STATE.route.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; color: rgba(255,255,255,0.6);">
                <p style="font-size: 16px; font-weight: 600; margin-bottom: 8px; color: rgba(255,255,255,0.8);">Tap markers to build your route</p>
                <p style="font-size: 13px;">Glowing markers have perfect timing</p>
            </div>
        `;
        return;
    }

    // Show current route
    let html = '<div style="padding: 16px;">';
    html += '<div style="font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">Your Route</div>';

    STATE.route.forEach((micId, i) => {
        const mic = STATE.mics.find(m => m.id === micId);
        if (!mic) return;

        const timeStr = mic.start ? mic.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
        const priceStr = mic.price === 0 || mic.price === 'Free' ? 'FREE' : `$${mic.price}`;
        const priceClass = mic.price === 0 || mic.price === 'Free' ? 'color: #4ade80;' : 'color: #fb923c;';

        html += `
            <div style="display: flex; align-items: center; padding: 12px; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 12px; margin-bottom: 8px;">
                <div style="font-size: 16px; font-weight: 700; width: 60px;">${timeStr}</div>
                <div style="flex: 1;">
                    <div style="font-size: 15px; font-weight: 600;">${mic.venue || mic.name}</div>
                    <div style="font-size: 12px; color: rgba(255,255,255,0.5);"><span style="${priceClass}">${priceStr}</span></div>
                </div>
                <button onclick="removeFromRoute('${micId}')" style="width: 32px; height: 32px; border-radius: 50%; background: rgba(239, 68, 68, 0.2); border: none; color: #ef4444; cursor: pointer; font-size: 16px;">✕</button>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}
