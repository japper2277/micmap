/* =================================================================
   MTA REALTIME
   Service alerts and live train arrivals
   ================================================================= */

const mtaService = {
    alertsCache: null,
    dismissedAlerts: JSON.parse(sessionStorage.getItem('mta_dismissed') || '[]'),

    // Fetch alerts from backend
    async fetchAlerts() {
        try {
            const res = await fetch(`${CONFIG.apiBase}/api/mta/alerts`);
            if (!res.ok) throw new Error('Failed to fetch alerts');
            this.alertsCache = await res.json();
            return this.alertsCache;
        } catch (e) {
            console.warn('MTA alerts error:', e);
            return [];
        }
    },

    // Get alerts for specific lines (filtered by dismissed)
    getAlertsForLines(lines) {
        if (!this.alertsCache) return [];
        return this.alertsCache.filter(alert =>
            alert.lines.some(l => lines.includes(l)) &&
            !this.dismissedAlerts.includes(alert.id)
        );
    },

    // Dismiss an alert
    dismissAlert(alertId) {
        this.dismissedAlerts.push(alertId);
        sessionStorage.setItem('mta_dismissed', JSON.stringify(this.dismissedAlerts));
        this.renderAlertsBanner();
    },

    // Get all unique lines from transit data stations
    getAllLines() {
        if (!window.TRANSIT_DATA?.stations) return [];
        const lines = new Set();
        // Valid MTA subway lines
        const validLines = ['1','2','3','4','5','6','7','A','C','E','B','D','F','M','G','J','Z','L','N','Q','R','W','S'];
        TRANSIT_DATA.stations.forEach(s => {
            // Extract lines from station name like "Bedford Av (L)" or "14 St-Union Sq (N Q R W)"
            const match = s.name.match(/\(([^)]+)\)/);
            if (match) {
                match[1].split(' ').forEach(l => {
                    if (validLines.includes(l)) lines.add(l);
                });
            }
        });
        return Array.from(lines);
    },

    // Render alerts banner at top of list (disabled - user preference)
    renderAlertsBanner() {
        return; // Alerts disabled in drawer
        const container = document.getElementById('mta-alerts');
        if (!container) return;

        const allLines = this.getAllLines();
        let alerts = this.getAlertsForLines(allLines);

        // Filter for important alerts only (delays, suspensions, service changes)
        const importantKeywords = ['delay', 'suspend', 'no service', 'running with', 'expect longer'];
        alerts = alerts.filter(a =>
            importantKeywords.some(kw => a.text.toLowerCase().includes(kw))
        );

        // Limit to max 3 alerts
        alerts = alerts.slice(0, 3);

        if (alerts.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = alerts.map(alert => `
            <div class="mta-alert ${alert.type}" data-id="${alert.id}">
                <div class="mta-alert-lines">
                    ${alert.lines.map(l => `<span class="mta-line mta-line-${l}">${l}</span>`).join('')}
                </div>
                <div class="mta-alert-text">${alert.text}</div>
                <button class="mta-alert-dismiss" onclick="mtaService.dismissAlert('${alert.id}')" aria-label="Dismiss alert">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `).join('');
    },

    // Fetch arrivals for a station
    async fetchArrivals(line, stopId) {
        try {
            const res = await fetch(`${CONFIG.apiBase}/api/mta/arrivals/${line}/${stopId}`);
            if (!res.ok) throw new Error('Failed to fetch arrivals');
            return await res.json();
        } catch (e) {
            console.warn('MTA arrivals error:', e);
            return [];
        }
    },

    // Render arrivals in a container
    renderArrivals(arrivals, container) {
        if (!container) return;

        if (arrivals.length === 0) {
            container.innerHTML = '<div class="mta-no-trains">No trains scheduled</div>';
            return;
        }

        // Group by direction
        const uptown = arrivals.filter(a => a.direction === 'uptown').slice(0, 3);
        const downtown = arrivals.filter(a => a.direction === 'downtown').slice(0, 3);

        const formatTime = (mins) => mins === 0 ? 'Now' : `${mins}m`;

        container.innerHTML = `
            <div class="mta-arrivals">
                ${uptown.length ? `
                    <div class="mta-direction">
                        <span class="mta-dir-label">Uptown</span>
                        <span class="mta-times">${uptown.map(a => formatTime(a.minsAway)).join(', ')}</span>
                    </div>
                ` : ''}
                ${downtown.length ? `
                    <div class="mta-direction">
                        <span class="mta-dir-label">Downtown</span>
                        <span class="mta-times">${downtown.map(a => formatTime(a.minsAway)).join(', ')}</span>
                    </div>
                ` : ''}
            </div>
        `;
    },

    // Initialize - fetch alerts on load
    async init() {
        await this.fetchAlerts();
        this.renderAlertsBanner();
        // Refresh alerts every 90 seconds
        setInterval(() => {
            this.fetchAlerts().then(() => this.renderAlertsBanner());
        }, 90000);
    }
};

// Auto-init - wait for TRANSIT_DATA to be available
document.addEventListener('DOMContentLoaded', () => {
    const waitForTransitData = () => {
        if (window.TRANSIT_DATA && TRANSIT_DATA.stations) {
            mtaService.init();
        } else {
            setTimeout(waitForTransitData, 200);
        }
    };
    waitForTransitData();
});
