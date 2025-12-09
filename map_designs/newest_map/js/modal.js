/* =================================================================
   MODAL
   Venue modal open/close/toggle functions
   ================================================================= */

// DOM element references (initialized after DOM loads)
let venueModal, modalTitle, modalAddress, modalTime, modalActions, modalInstructions, modalInstructionsText, modalArrivals;

// SVG Icons for buttons
const iconMap = `<svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
const iconExternal = `<svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`;

// Initialize modal DOM references
function initModal() {
    venueModal = document.getElementById('venue-modal');
    modalTitle = document.getElementById('modal-title');
    modalAddress = document.getElementById('modal-address');
    modalTime = document.getElementById('modal-time');
    modalActions = document.getElementById('modal-actions');
    modalInstructions = document.getElementById('modal-instructions');
    modalInstructionsText = document.getElementById('modal-instructions-text');
    modalArrivals = document.getElementById('modal-arrivals');

    // Close modal on background click
    venueModal.addEventListener('click', (e) => {
        if (e.target === venueModal) closeVenueModal();
    });

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && venueModal.classList.contains('active')) {
            closeVenueModal();
        }
    });
}

function openVenueModal(mic) {
    if (!mic) return;

    // Set content
    modalTitle.innerText = (mic.title || 'Unknown Venue').toUpperCase();
    modalAddress.innerText = (mic.address || '').toUpperCase();

    // Time display with status color
    if (mic.status === 'live') {
        modalTime.innerText = 'LIVE NOW';
        modalTime.className = 'live';
    } else {
        modalTime.innerText = mic.timeStr;
        modalTime.className = '';
    }

    // Hide instructions initially
    modalInstructions.classList.remove('show');

    // Build action buttons
    let html = '';

    // DIRECTIONS button (always shown)
    html += `
        <a href="#" onclick="openDirections(${mic.lat}, ${mic.lng}); return false;" class="modal-btn modal-btn-secondary">
            ${iconMap} DIRECTIONS
        </a>
    `;

    // SIGN UP or INFO button
    if (mic.signupUrl) {
        html += `
            <a href="${mic.signupUrl}" target="_blank" rel="noopener" class="modal-btn modal-btn-primary">
                SIGN UP ${iconExternal}
            </a>
        `;
    } else {
        html += `
            <button class="modal-btn modal-btn-icon" onclick="toggleModalInstructions()">
                i
            </button>
        `;
        // Store instructions text
        modalInstructionsText.innerText = mic.signupInstructions || 'No signup instructions available.';
    }

    modalActions.innerHTML = html;
    venueModal.classList.add('active');

    // Fetch live train arrivals for nearest station
    loadModalArrivals(mic);
}

// Load live train arrivals for venue's nearest station
async function loadModalArrivals(mic) {
    if (!modalArrivals) return;

    // Find nearest station for this venue
    const nearestStation = findNearestStation(mic.lat, mic.lng);
    if (!nearestStation || !nearestStation.gtfsStopId) {
        modalArrivals.innerHTML = '';
        return;
    }

    // Extract line from station name (e.g., "Bedford Av (L)" -> "L")
    const lineMatch = nearestStation.name.match(/\(([^)]+)\)/);
    if (!lineMatch) {
        modalArrivals.innerHTML = '';
        return;
    }

    // Get first line (for multi-line stations like "14 St (N Q R W)", just use first)
    const line = lineMatch[1].split(' ')[0];

    // Show loading state
    modalArrivals.innerHTML = `
        <div class="modal-arrivals-header">
            <span class="mta-line mta-line-${line}">${line}</span>
            <span class="modal-arrivals-station">${nearestStation.name}</span>
        </div>
        <div class="mta-arrivals-loading">Loading...</div>
    `;

    // Fetch arrivals
    const arrivals = await mtaService.fetchArrivals(line, nearestStation.gtfsStopId);

    // Render
    if (arrivals.length === 0) {
        modalArrivals.innerHTML = `
            <div class="modal-arrivals-header">
                <span class="mta-line mta-line-${line}">${line}</span>
                <span class="modal-arrivals-station">${nearestStation.name}</span>
            </div>
            <div class="mta-no-trains">No trains scheduled</div>
        `;
        return;
    }

    // Group by direction (dynamic - backend sends correct labels)
    const directions = {};
    arrivals.forEach(a => {
        if (!directions[a.direction]) directions[a.direction] = [];
        if (directions[a.direction].length < 3) directions[a.direction].push(a);
    });

    const formatTime = (mins) => mins === 0 ? 'Now' : `${mins}m`;

    modalArrivals.innerHTML = `
        <div class="modal-arrivals-header">
            <span class="mta-line mta-line-${line}">${line}</span>
            <span class="modal-arrivals-station">${nearestStation.name}</span>
        </div>
        <div class="mta-arrivals">
            ${Object.entries(directions).map(([dir, trains]) => `
                <div class="mta-direction">
                    <span class="mta-dir-label">${dir}</span>
                    <span class="mta-times">${trains.map(a => formatTime(a.minsAway)).join(', ')}</span>
                </div>
            `).join('')}
        </div>
    `;
}

// Find nearest station to a lat/lng
function findNearestStation(lat, lng) {
    if (!window.TRANSIT_DATA?.stations) return null;

    let nearest = null;
    let minDist = Infinity;

    TRANSIT_DATA.stations.forEach(station => {
        const dist = Math.sqrt(
            Math.pow(lat - station.lat, 2) +
            Math.pow(lng - station.lng, 2)
        );
        if (dist < minDist) {
            minDist = dist;
            nearest = station;
        }
    });

    return nearest;
}

function closeVenueModal() {
    venueModal.classList.remove('active');
    modalInstructions.classList.remove('show');
}

function toggleModalInstructions() {
    modalInstructions.classList.toggle('show');
}
