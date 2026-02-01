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

// ============================================================
// PRIORITY 3: Expandable Alternatives Display
// ============================================================

// Render alternatives for a mic
function renderAlternatives(mic, index) {
    // Get alternatives from hour buckets (time-based)
    const timeAlternatives = PlannerState.getAlternatives(mic);

    // Get alternatives from geo index (proximity-based)
    const nearbyAlternatives = PlannerState.getNearbyMics(mic, 0.25);

    // Tag each alternative with its source
    const taggedTime = timeAlternatives.map(a => ({ ...a, source: 'time' }));
    const taggedNearby = nearbyAlternatives.map(a => ({ ...a, source: 'nearby' }));

    // Combine and dedupe, preferring time-based
    const allAlternatives = [...taggedTime];
    taggedNearby.forEach(alt => {
        if (!allAlternatives.some(a => a.id === alt.id)) {
            allAlternatives.push(alt);
        }
    });

    // Limit to 4 for better options
    const alternatives = allAlternatives.slice(0, 4);

    if (alternatives.length === 0) return '';

    const alternativeItems = alternatives.map((alt, altIndex) => {
        const time = minsToTime(alt.startMins);
        const timeDiff = alt.startMins - mic.startMins;
        const timeDiffText = timeDiff === 0 ? 'same time' :
            timeDiff > 0 ? `${timeDiff}m later` : `${Math.abs(timeDiff)}m earlier`;

        const priceText = alt.cost > 0 ? `$${alt.cost}` : 'Free';
        const priceClass = alt.cost > 0 ? 'paid' : 'free';

        // Calculate distance/walk time if nearby
        let proximityText = '';
        let proximityIcon = '';
        if (mic.lat && mic.lng && alt.lat && alt.lng) {
            const distance = PlannerState._haversineDistance(mic.lat, mic.lng, alt.lat, alt.lng);
            const walkableMiles = typeof getWalkableMilesFromUI === 'function' ? getWalkableMilesFromUI() : 0.5;
            if (distance < walkableMiles) {
                const walkMins = Math.round(distance * 20);
                proximityText = `${walkMins}m walk`;
                proximityIcon = '🚶';
            }
        }

        // Source badge
        const sourceBadge = alt.source === 'nearby' && proximityText
            ? `<span class="alt-source nearby" title="Nearby venue">${proximityIcon}</span>`
            : alt.source === 'time'
            ? `<span class="alt-source time" title="Similar time">🕐</span>`
            : '';

        return `
            <div class="alt-item" data-mic-id="${alt.id}" role="option" tabindex="${altIndex === 0 ? '0' : '-1'}">
                ${sourceBadge}
                <div class="alt-info">
                    <span class="alt-time">${time}</span>
                    <span class="alt-name">${alt.venueName || alt.venue}</span>
                    <span class="alt-diff">${timeDiffText}</span>
                </div>
                <div class="alt-meta">
                    <span class="alt-price ${priceClass}">${priceText}</span>
                    ${proximityText ? `<span class="alt-proximity">${proximityText}</span>` : ''}
                </div>
                <button class="alt-swap-btn" onclick="swapMicInRoute(${index}, '${alt.id}')" aria-label="Swap to ${alt.venueName || alt.venue}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4"/>
                    </svg>
                    Swap
                </button>
            </div>
        `;
    }).join('');

    return `
        <div class="tl-alternatives" role="group" aria-label="Alternative venues">
            <button class="alt-toggle" onclick="toggleAlternatives(this)" aria-expanded="false" aria-controls="alt-list-${index}">
                <span class="alt-toggle-text">${alternatives.length} alternative${alternatives.length > 1 ? 's' : ''}</span>
                <svg class="alt-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            </button>
            <div id="alt-list-${index}" class="alt-list" role="listbox">
                ${alternativeItems}
            </div>
        </div>
    `;
}

// Toggle alternatives visibility
function toggleAlternatives(btn) {
    const wrapper = btn.closest('.tl-alternatives');
    const list = wrapper ? wrapper.querySelector('.alt-list') : btn.nextElementSibling;
    const isExpanded = btn.getAttribute('aria-expanded') === 'true';

    // Close any other open alternatives lists (accordion behavior)
    document.querySelectorAll('.tl-alternatives .alt-toggle[aria-expanded="true"]').forEach(otherBtn => {
        if (otherBtn === btn) return;
        otherBtn.setAttribute('aria-expanded', 'false');
        otherBtn.classList.remove('expanded');
        const otherList = otherBtn.closest('.tl-alternatives')?.querySelector('.alt-list');
        if (otherList) otherList.classList.remove('show');
    });

    const nextExpanded = !isExpanded;
    btn.setAttribute('aria-expanded', String(nextExpanded));
    btn.classList.toggle('expanded', nextExpanded);
    if (list) list.classList.toggle('show', nextExpanded);

    if (nextExpanded) {
        // Make sure the control stays visible after expanding
        setTimeout(() => {
            try {
                btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch (_) {}
        }, 50);
    }
}

// Toggle overflow menu visibility
function toggleOverflowMenu(btn) {
    const menu = btn.nextElementSibling;
    const isExpanded = btn.getAttribute('aria-expanded') === 'true';

    // Close all other open menus first
    closeAllOverflowMenus();

    if (!isExpanded) {
        btn.setAttribute('aria-expanded', 'true');
        menu.classList.add('show');

        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', closeOverflowOnClickOutside);
        }, 0);
    }
}

// Close all overflow menus
function closeAllOverflowMenus() {
    document.querySelectorAll('.tl-overflow-menu.show').forEach(menu => {
        menu.classList.remove('show');
        const btn = menu.previousElementSibling;
        if (btn) btn.setAttribute('aria-expanded', 'false');
    });
    document.removeEventListener('click', closeOverflowOnClickOutside);
}

// Close overflow menu when clicking outside
function closeOverflowOnClickOutside(e) {
    if (!e.target.closest('.tl-overflow-wrapper')) {
        closeAllOverflowMenus();
    }
}

// Swap mic in current route
async function swapMicInRoute(index, newMicId) {
    if (!currentRoute || !currentRoute.sequence) {
        showToast('No route to modify', 'error');
        return;
    }

    const newMic = allMics.find(m => m.id === newMicId);
    if (!newMic) {
        showToast('Mic not found', 'error');
        return;
    }

    // Get the current sequence entry
    const oldEntry = currentRoute.sequence[index];
    if (!oldEntry) {
        showToast('Invalid position', 'error');
        return;
    }

    // Show loading state
    const swapBtn = document.querySelector(`[data-mic-id="${newMicId}"] .alt-swap-btn`);
    if (swapBtn) {
        swapBtn.innerHTML = '<div class="spinner-inline-sm"></div>';
        swapBtn.disabled = true;
    }

    // Save current state to undo stack before modifying
    if (typeof saveRouteToUndoStack === 'function') {
        saveRouteToUndoStack();
    }

    try {
        // Calculate new transit time from previous location
        let prevLat, prevLng;
        if (index === 0) {
            prevLat = currentRoute.origin.lat;
            prevLng = currentRoute.origin.lng;
        } else {
            const prevMic = currentRoute.sequence[index - 1].mic;
            prevLat = prevMic.lat;
            prevLng = prevMic.lng;
        }

        // Get transit time
        let transitData = { mins: 0, type: 'walk', route: null, isEstimate: false };
        if (prevLat && prevLng && newMic.lat && newMic.lng) {
            const distance = haversine(prevLat, prevLng, newMic.lat, newMic.lng);
            const walkableMiles = typeof getWalkableMilesFromUI === 'function' ? getWalkableMilesFromUI() : 0.5;
            if (distance < walkableMiles) {
                transitData.mins = Math.round(distance * 20);
                transitData.type = 'walk';
                transitData.isEstimate = false;
            } else {
                try {
                    const route = await fetchSubwayRoute(prevLat, prevLng, newMic.lat, newMic.lng);
                    if (route) {
                        transitData.mins = route.adjustedTotalTime || route.totalTime || route.duration;
                        transitData.type = 'transit';
                        transitData.route = route;
                        transitData.isEstimate = false;
                    }
                } catch (e) {
                    transitData.mins = Math.round(5 + distance * 3);
                    transitData.type = 'estimate';
                    transitData.isEstimate = true;
                }
            }
        }

        // Update the sequence
        currentRoute.sequence[index] = {
            mic: newMic,
            arriveBy: newMic.startMins,
            transitFromPrev: {
                mins: transitData.mins,
                type: transitData.type,
                subwayRoute: transitData.route,
                isEstimate: !!transitData.isEstimate
            },
            isAnchorStart: oldEntry.isAnchorStart,
            isAnchorMust: oldEntry.isAnchorMust,
            isAnchorEnd: oldEntry.isAnchorEnd
        };

        // FIX: Recalculate transit to NEXT stop if it exists
        if (index + 1 < currentRoute.sequence.length) {
            const nextEntry = currentRoute.sequence[index + 1];
            const nextMic = nextEntry.mic;

            let nextTransitData = { mins: 0, type: 'walk', route: null, isEstimate: false };
            if (newMic.lat && newMic.lng && nextMic.lat && nextMic.lng) {
                const nextDistance = haversine(newMic.lat, newMic.lng, nextMic.lat, nextMic.lng);
                const walkableMiles = typeof getWalkableMilesFromUI === 'function' ? getWalkableMilesFromUI() : 0.5;

                if (nextDistance < walkableMiles) {
                    nextTransitData.mins = Math.round(nextDistance * 20);
                    nextTransitData.type = 'walk';
                    nextTransitData.isEstimate = false;
                } else {
                    try {
                        const nextRoute = await fetchSubwayRoute(newMic.lat, newMic.lng, nextMic.lat, nextMic.lng);
                        if (nextRoute) {
                            nextTransitData.mins = nextRoute.adjustedTotalTime || nextRoute.totalTime || nextRoute.duration;
                            nextTransitData.type = 'transit';
                            nextTransitData.route = nextRoute;
                            nextTransitData.isEstimate = false;
                        } else {
                            nextTransitData.mins = Math.round(5 + nextDistance * 3);
                            nextTransitData.type = 'estimate';
                            nextTransitData.isEstimate = true;
                        }
                    } catch (e) {
                        nextTransitData.mins = Math.round(5 + nextDistance * 3);
                        nextTransitData.type = 'estimate';
                        nextTransitData.isEstimate = true;
                    }
                }
            }

            // Update next entry's transit
            currentRoute.sequence[index + 1].transitFromPrev = {
                mins: nextTransitData.mins,
                type: nextTransitData.type,
                subwayRoute: nextTransitData.route,
                isEstimate: !!nextTransitData.isEstimate
            };
        }

        // Re-render results
        await renderResults(currentRoute.sequence, currentRoute.origin, currentRoute.timePerVenue);

        showToast(`Swapped to ${newMic.venueName || newMic.venue}`, 'success');

    } catch (e) {
        showToast('Failed to swap mic', 'error');
        // Restore button
        if (swapBtn) {
            swapBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4"/></svg> Swap`;
            swapBtn.disabled = false;
        }
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

    // Transit estimate banner
    const hasEstimates = typeof hasTransitEstimates === 'function'
        ? hasTransitEstimates(sequence)
        : sequence.some(e => e.transitFromPrev?.type === 'estimate' || e.transitFromPrev?.isEstimate);

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

    let estimatesHtml = '';
    if (hasEstimates) {
        estimatesHtml = `
            <div class="mb-4 p-3 rounded-xl bg-orange-500/10 border border-orange-500/30" role="status" aria-label="Estimated transit warning">
                <div class="text-orange-300 font-bold text-xs mb-1">ESTIMATED TRANSIT</div>
                <div class="text-sm text-zinc-300 mb-2">Some legs are estimated because the transit API didn’t return a route.</div>
                <button class="filter-preview-link" onclick="recalculateWithRealTransit()" type="button">Recalculate with real times</button>
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

    // Check if undo is available
    const hasUndoHistory = typeof routeUndoStack !== 'undefined' && routeUndoStack.length > 0;

    let html = alertsHtml + estimatesHtml + `
        <div class="trip-summary" role="region" aria-label="Trip summary">
            <div class="trip-summary-duration">
                <span class="value">${formatDuration(totalTripMins)}</span>
            </div>
            <div class="trip-summary-details" aria-label="Trip summary details">
                <span class="trip-summary-meta">${totalDistanceMiles.toFixed(1)} mi</span>
                <span class="trip-summary-sep" aria-hidden="true">•</span>
                <span class="trip-summary-meta">Done ${endTime}</span>
            </div>
            <div class="trip-summary-actions">
                <button id="undo-btn" class="undo-btn" onclick="undoRouteChange()" ${hasUndoHistory ? '' : 'disabled'} aria-label="Undo last route change">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M3 10h10a5 5 0 015 5v2M3 10l6-6M3 10l6 6"/>
                    </svg>
                    Undo
                </button>
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
            let primaryTransitLine = null;
            let primaryTransitLineColor = null;
            let primaryTransitDarkText = false;

            if (transitInfo.subwayRoute && transitInfo.subwayRoute.legs) {
                const subwayLegs = transitInfo.subwayRoute.legs.filter(leg => leg.type === 'subway');
                if (subwayLegs.length > 0) {
                    primaryTransitLine = subwayLegs[0].line;
                    primaryTransitLineColor = LINE_COLORS[primaryTransitLine] || '#666';
                    primaryTransitDarkText = DARK_TEXT_LINES.includes(primaryTransitLine);
                }
            }

            const isEstimate = transitInfo.type === 'estimate' || transitInfo.isEstimate;
            const isWalking = transitInfo.type === 'walk';
            const transitLabel = isWalking ? `${transitMins}m walk` : `${transitMins}m`;
            const ariaLabel = isWalking
                ? `Walk ${transitMins} minutes`
                : isEstimate
                    ? `Estimated travel ${transitMins} minutes`
                    : `${primaryTransitLine || 'Transit'} ${transitMins} minutes`;

            transitConnectorHtml = `
                <div class="transit-connector${isWalking ? ' walking' : ''}${isEstimate ? ' estimate' : ''}">
                    <div class="transit-connector-content" aria-label="${ariaLabel}">
                        ${isWalking ? `
                            <span class="transit-pill-icon transit-pill-icon-walk" aria-hidden="true">🚶</span>
                        ` : isEstimate ? `
                            <span class="transit-pill-icon transit-pill-icon-walk" aria-hidden="true">⚠️</span>
                        ` : `
                            <span class="transit-pill-icon transit-pill-icon-line ${primaryTransitDarkText ? 'dark-text' : ''}" style="background: ${primaryTransitLineColor}" aria-hidden="true">${primaryTransitLine}</span>
                        `}
                        <span class="transit-pill-time">${transitLabel}</span>
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

        // Numbered route marker (Uber-style) - replaces old stop badge
        const stopNumber = i + 1;
        const markerClass = isFirst ? 'start' : (isLast ? 'end' : 'middle');
        const routeMarkerHtml = `<div class="route-marker ${markerClass}" aria-label="Stop ${stopNumber}">${stopNumber}</div>`;

        html += `
            <div class="${cardClasses.join(' ')}">
                ${routeMarkerHtml}
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

                <!-- Right: Quick actions -->
                <div class="tl-actions" aria-label="Stop actions">
                    <button class="tl-action-btn" onclick="openDirections('', ${mic.lat || 'null'}, ${mic.lng || 'null'})" aria-label="Directions to ${escapeHtml(mic.venueName || mic.venue || 'venue')}">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A2 2 0 013 15.382V5.618a2 2 0 011.553-1.948L9 2m0 18l6-2m-6 2V2m6 16l5.447 2.724A2 2 0 0021 18.382V8.618a2 2 0 00-1.553-1.948L15 5m0 13V5m0 0L9 2"/>
                        </svg>
                    </button>

                    ${signupEmail ? `
                        <a class="tl-action-btn" href="mailto:${signupEmail}" aria-label="Email signup for ${escapeHtml(mic.venueName || mic.venue || 'venue')}">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                            </svg>
                        </a>
                    ` : signupUrl ? `
                        <a class="tl-action-btn" href="${signupUrl}" target="_blank" rel="noopener" aria-label="Signup link for ${escapeHtml(mic.venueName || mic.venue || 'venue')}">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 3h7v7m0-7L10 14"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 7H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4"/>
                            </svg>
                        </a>
                    ` : `
                        <button class="tl-action-btn" disabled aria-label="No signup link available">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                            </svg>
                        </button>
                    `}

                    <button class="tl-action-btn" onclick="showInsertMicPicker(${i})" aria-label="Add stop after ${escapeHtml(mic.venueName || mic.venue || 'venue')}">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                        </svg>
                    </button>

                    <button class="tl-action-btn" onclick="removeMicFromRoute('${mic.id}')" aria-label="Remove ${escapeHtml(mic.venueName || mic.venue || 'venue')} from route">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>

                <!-- Alternatives section (Priority 3) -->
                ${renderAlternatives(mic, i)}
            </div>
        `;
    });

    // Close timeline container
    html += `</div>`;

    // ADD STOP BUTTON (Undo is in the trip summary header)
    html += `
        <button class="add-stop-btn" onclick="showInsertMicPicker(${sequence.length - 1})" aria-label="Add another stop to your route">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
            <span>Add Another Stop</span>
        </button>
    `;

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

    // Show first-visit instruction banner if this is user's first time
    if (typeof showFirstVisitBannerIfNeeded === 'function') {
        showFirstVisitBannerIfNeeded();
    }
}

// Note: overflow menu handlers are defined above; avoid duplicate definitions.
