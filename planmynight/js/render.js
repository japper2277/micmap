// Plan My Night - Results Rendering

// Cache DOM elements for performance
const DOM = {
    timeline: null,
    summary: null,

    init() {
        this.timeline = document.getElementById('timeline');
        this.summary = document.getElementById('summary');
    },

    getTimeline() {
        if (!this.timeline) this.timeline = document.getElementById('timeline');
        return this.timeline;
    },

    getSummary() {
        if (!this.summary) this.summary = document.getElementById('summary');
        return this.summary;
    }
};

// Initialize DOM cache when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => DOM.init());
} else {
    DOM.init();
}

// Show skeleton loading state for timeline
function showTimelineSkeleton(count = 3) {
    const tl = DOM.getTimeline();
    if (!tl) return;

    let skeletonHtml = `
        <div class="timeline-skeleton" aria-label="Loading route..." role="status">
            <!-- Skeleton departure card -->
            <div class="skeleton-card" style="padding-left: 0;">
                <div class="skeleton-content" style="align-items: center;">
                    <div class="skeleton-badge" style="width: 80px; height: 20px;"></div>
                    <div class="skeleton-time-block" style="width: 70px; height: 32px;"></div>
                    <div class="skeleton-badge" style="width: 100px; height: 16px;"></div>
                </div>
            </div>
    `;

    for (let i = 0; i < count; i++) {
        if (i > 0) {
            // Connector skeleton
            skeletonHtml += `
                <div class="skeleton-connector">
                    <div class="skeleton-connector-pill"></div>
                </div>
            `;
        }

        // Card skeleton
        skeletonHtml += `
            <div class="skeleton-card">
                <div class="skeleton-time">
                    <div class="skeleton-time-block"></div>
                </div>
                <div class="skeleton-content">
                    <div class="skeleton-venue"></div>
                    <div class="skeleton-meta">
                        <div class="skeleton-badge"></div>
                        <div class="skeleton-badge" style="width: 40px;"></div>
                    </div>
                </div>
            </div>
        `;
    }

    skeletonHtml += `
            <span class="sr-only">Loading your route...</span>
        </div>
    `;

    tl.innerHTML = skeletonHtml;
}

// Hide skeleton and show results
function hideTimelineSkeleton() {
    const skeleton = document.querySelector('.timeline-skeleton');
    if (skeleton) {
        skeleton.style.opacity = '0';
        skeleton.style.transition = 'opacity 0.2s ease';
        setTimeout(() => skeleton.remove(), 200);
    }
}

// Helper to format duration nicely
function formatDuration(totalMins) {
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
}

async function renderResults(sequence, origin, timePerVenue = 60) {
    // Store current route for sharing/saving
    currentRoute = { sequence, origin, timePerVenue };

    // Calculate trip statistics
    const totalTransitMins = sequence.reduce((sum, e) => sum + (e.transitFromPrev?.mins || 0), 0);
    const totalVenueTime = sequence.length * timePerVenue;
    const totalTripMins = totalTransitMins + totalVenueTime;

    // Calculate total distance (with coordinate validation)
    let totalDistanceMiles = 0;
    let prevLat = origin.lat;
    let prevLng = origin.lng;
    if (prevLat && prevLng) {
        sequence.forEach(entry => {
            const mic = entry.mic;
            if (mic && typeof mic.lat === 'number' && typeof mic.lng === 'number') {
                totalDistanceMiles += haversine(prevLat, prevLng, mic.lat, mic.lng);
                prevLat = mic.lat;
                prevLng = mic.lng;
            }
        });
    }

    // Calculate end time
    const firstMicStartMins = sequence[0]?.mic.startMins || 0;
    const endMins = firstMicStartMins + totalTripMins;
    const endTime = minsToTime(endMins);

    const tl = DOM.getTimeline();

    // Fetch MTA alerts
    const mtaAlerts = await fetchMTAAlerts();

    // Extract all subway lines from route
    const routeLines = new Set();
    sequence.forEach(entry => {
        if (entry.transitFromPrev.subwayRoute && entry.transitFromPrev.subwayRoute.legs) {
            entry.transitFromPrev.subwayRoute.legs.forEach(leg => {
                if (leg.type === 'subway' && leg.line) {
                    routeLines.add(leg.line);
                }
            });
        }
    });

    // Filter alerts for lines in this route
    const relevantAlerts = mtaAlerts.filter(alert =>
        alert.lines && alert.lines.some(line => routeLines.has(line))
    ).slice(0, 2);

    // MTA ALERTS
    let alertsHtml = '';
    if (relevantAlerts.length > 0) {
        alertsHtml = `
            <div class="mta-alert-container mb-4 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30" role="alert" aria-label="Service alerts for your route">
                <div class="text-yellow-400 font-bold text-xs mb-2 flex items-center gap-2">
                    <span class="mta-alert-icon">⚠️</span>
                    <span>SERVICE ALERTS</span>
                </div>
                ${relevantAlerts.map(alert => {
                    const lineColors = alert.lines.map(l => LINE_COLORS[l] || '#808183');
                    const isHighPriority = alert.priority === 'high' || alert.severity === 'major';
                    return `
                        <div class="text-xs text-yellow-200 mb-2 last:mb-0 ${isHighPriority ? 'mta-alert-high-priority p-2 rounded-lg' : ''}">
                            <div class="flex items-center gap-1 mb-1">
                                ${alert.lines.map((line, idx) => `
                                    <span class="line-badge" style="background: ${lineColors[idx]}; width: 18px; height: 18px; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; color: white; font-size: 10px;">${line}</span>
                                `).join('')}
                            </div>
                            <div class="text-zinc-300">${alert.text || alert.header}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // Calculate departure time
    let departureHtml = '';
    if (sequence.length > 0) {
        const firstMic = sequence[0].mic;
        const firstTransitMins = sequence[0].transitFromPrev?.mins || 0;
        const firstArriveByMins = firstMic.startMins - 15;
        if (!isNaN(firstArriveByMins) && !isNaN(firstTransitMins)) {
            const departOriginMins = firstArriveByMins - firstTransitMins;
            const departTime = minsToTime(departOriginMins);
            const locationName = origin.name || 'My Location';
            departureHtml = `
                <div class="departure-card">
                    <span class="departure-label">🚶 Depart</span>
                    <span class="departure-time">${departTime}</span>
                    <span class="departure-location">from ${locationName}</span>
                </div>
            `;
        }
    }

    // TRIP SUMMARY HEADER with improved design
    let html = alertsHtml + `
        <div class="trip-summary">
            <div class="trip-summary-duration">
                <span class="icon">⏱️</span>
                <span class="value">${formatDuration(totalTripMins)}</span>
            </div>
            <div class="trip-summary-details">
                <span class="detail-item">
                    <span class="detail-icon">📍</span>
                    ${totalDistanceMiles.toFixed(1)} mi
                </span>
                <span class="detail-item">
                    <span class="detail-icon">🏁</span>
                    Done ${endTime}
                </span>
            </div>
        </div>

        ${departureHtml}

        <div class="timeline-container">
    `;

    sequence.forEach((entry, i) => {
        const mic = entry.mic;
        const transitMins = entry.transitFromPrev?.mins || 0;
        const isFirst = i === 0;
        const isLast = i === sequence.length - 1;

        // Mic Card - times
        const startTime = minsToTime(mic.startMins);

        // Price display
        let priceText = '';
        if (mic.cost > 0) {
            priceText = `$${mic.cost}${mic.priceNote ? ` ${mic.priceNote.toUpperCase()}` : ' CASH'}`;
        } else {
            priceText = 'FREE';
        }
        const priceClass = mic.cost > 0 ? 'paid' : 'free';

        // Get nearby subway lines
        const nearbyLines = mic.nearbyLines || [];
        const primaryLine = nearbyLines[0] || null;
        const primaryLineColor = primaryLine ? (LINE_COLORS[primaryLine] || '#666') : null;
        const isDarkTextLine = primaryLine && DARK_TEXT_LINES.includes(primaryLine);

        // Email/signup link
        const signupEmail = mic.signupEmail || mic.email || null;
        const signupUrl = mic.signupUrl || mic.url || null;

        // Stage time
        const stageTime = mic.stageTime || null;

        // Extract Instagram handle
        let igHandle = '';
        if (mic.host || mic.contact) {
            const hostStr = mic.host || mic.contact || '';
            const igMatch = hostStr.match(/@([a-zA-Z0-9_.]+)/);
            if (igMatch) igHandle = igMatch[1];
        }
        if (!igHandle && mic.instagram) {
            igHandle = mic.instagram.replace('@', '');
        }

        // Build transit connector (between stops)
        let transitConnectorHtml = '';
        if (!isFirst && transitMins > 0) {
            // Get subway lines used for this leg
            const transitInfo = entry.transitFromPrev;
            let transitLinesHtml = '';
            let transitMode = '🚇'; // default subway

            if (transitInfo.subwayRoute && transitInfo.subwayRoute.legs) {
                const subwayLegs = transitInfo.subwayRoute.legs.filter(leg => leg.type === 'subway');
                if (subwayLegs.length > 0) {
                    transitLinesHtml = subwayLegs.map(leg => {
                        const lineColor = LINE_COLORS[leg.line] || '#666';
                        const isDark = DARK_TEXT_LINES.includes(leg.line);
                        return `<span class="transit-line ${isDark ? 'dark-text' : ''}" style="background: ${lineColor}">${leg.line}</span>`;
                    }).join('');
                } else {
                    transitMode = '🚶';
                }
            }

            transitConnectorHtml = `
                <div class="transit-connector">
                    <div class="transit-connector-content">
                        ${transitLinesHtml ? `
                            <span class="transit-icon">${transitMode}</span>
                            <div class="transit-lines">${transitLinesHtml}</div>
                        ` : `
                            <span class="transit-icon">🚶</span>
                        `}
                        <span class="transit-duration">${transitMins} min</span>
                    </div>
                </div>
            `;
        }

        // Add transit connector before the card (except for first stop)
        html += transitConnectorHtml;

        // Card classes for first/last stop styling
        const cardClasses = ['tl-card'];
        if (isFirst) cardClasses.push('first-stop');
        if (isLast) cardClasses.push('last-stop');

        // Stop badge
        let stopBadgeHtml = '';
        if (isFirst && sequence.length > 1) {
            stopBadgeHtml = '<span class="tl-stop-badge start">Start</span>';
        } else if (isLast && sequence.length > 1) {
            stopBadgeHtml = '<span class="tl-stop-badge end">Final</span>';
        }

        html += `
            <div class="${cardClasses.join(' ')}">
                ${stopBadgeHtml}
                <!-- Left: Time column -->
                <div class="tl-time-col">
                    <div class="tl-time">${startTime.replace(/\s*(AM|PM)/i, '').replace(':', ':')}</div>
                    ${stageTime ? `<div class="tl-transit-badge">${stageTime}</div>` : ''}
                </div>

                <!-- Middle: Content -->
                <div class="tl-content">
                    <div class="tl-row1">
                        <span class="tl-venue">${mic.venueName || mic.venue || 'Unknown Venue'}</span>
                        ${mic.borough ? `<span class="tl-borough-badge">${mic.borough.toUpperCase()}</span>` : ''}
                    </div>
                    <div class="tl-row2">
                        ${mic.neighborhood ? `<span class="tl-neighborhood">${mic.neighborhood.toUpperCase()}</span>` : ''}
                        <span class="tl-price-badge ${priceClass}">${priceText}</span>
                        ${primaryLine ? `
                            <span class="tl-line-badge ${isDarkTextLine ? 'dark-text' : ''}" style="background: ${primaryLineColor}">${primaryLine}</span>
                        ` : ''}
                    </div>
                </div>

                <!-- Right: Action buttons -->
                <div class="tl-actions">
                    ${signupEmail ? `
                        <a href="mailto:${signupEmail}" class="tl-action-btn" title="Email signup" aria-label="Email signup for ${mic.venueName || mic.venue || 'venue'}">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                            </svg>
                        </a>
                    ` : signupUrl ? `
                        <a href="${signupUrl}" target="_blank" class="tl-action-btn" title="Sign up" aria-label="Sign up for ${mic.venueName || mic.venue || 'venue'}">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                            </svg>
                        </a>
                    ` : ''}
                    ${igHandle ? `
                        <a href="https://instagram.com/${igHandle}" target="_blank" class="tl-action-btn ig-btn" title="Instagram" aria-label="Instagram for ${mic.venueName || mic.venue || 'venue'}">
                            <svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                            </svg>
                        </a>
                    ` : ''}
                </div>
            </div>
        `;
    });

    // Close timeline container
    html += `</div>`;

    // TRIP COST FOOTER
    const totalCost = sequence.reduce((sum, e) => sum + (e.mic.cost || 0), 0);
    if (totalCost > 0) {
        html += `
            <div class="mt-6 py-4 px-5 rounded-xl bg-zinc-800/50 border border-zinc-700 flex items-center justify-between">
                <span class="text-zinc-400">Total Cost</span>
                <span class="text-white font-bold text-lg">$${totalCost}</span>
            </div>
        `;
    }

    tl.innerHTML = html;

    // Update summary
    const summary = DOM.getSummary();
    if (summary) summary.textContent = `${sequence.length} stop${sequence.length > 1 ? 's' : ''}`;
}
