// Plan My Night - Share & Save Functionality

// Button success animation helper
function showButtonSuccess(button, originalContent, successContent, duration = 2000) {
    if (!button) return;

    // Store original content if not provided
    const original = originalContent || button.innerHTML;

    // Add success state
    button.classList.add('btn-success');
    button.innerHTML = successContent;
    haptic('success');

    // Revert after duration
    setTimeout(() => {
        button.classList.remove('btn-success');
        button.innerHTML = original;
    }, duration);
}

// Generic button loading state
function setButtonLoading(button, loadingText = 'Loading...') {
    if (!button) return;
    button.disabled = true;
    button.dataset.originalContent = button.innerHTML;
    button.innerHTML = `<div class="spinner-inline" style="width:14px;height:14px;"></div> <span>${loadingText}</span>`;
}

function resetButtonLoading(button) {
    if (!button) return;
    button.disabled = false;
    if (button.dataset.originalContent) {
        button.innerHTML = button.dataset.originalContent;
        delete button.dataset.originalContent;
    }
}

async function shareRoute() {
    if (!currentRoute || currentRoute.sequence.length === 0) {
        showToast('No route to share');
        return;
    }

    if (!navigator.share) {
        copyRouteToClipboard();
        return;
    }

    try {
        const { sequence, origin } = currentRoute;

        let shareText = `🎤 My Mic Crawl - ${new Date().toLocaleDateString()}\n\n`;
        shareText += `📍 Starting from: ${origin.name || 'My Location'}\n\n`;

        sequence.forEach((entry, i) => {
            const mic = entry.mic;
            shareText += `${i + 1}. ${mic.venueName || mic.venue}\n`;
            shareText += `   ⏰ ${minsToTime(entry.arriveBy)}`;
            if (mic.neighborhood && mic.neighborhood !== 'NYC') shareText += ` • ${mic.neighborhood}`;
            if (mic.cost > 0) shareText += ` • $${mic.cost}`;
            else shareText += ` • Free`;
            if (mic.status === 'live') shareText += ` 🟢 Live`;
            if (mic.status === 'upcoming') shareText += ` 🔴 Soon`;
            if (entry.isAnchorStart) shareText += ` 🎯`;
            if (entry.isAnchorMust) shareText += ` 📌`;
            if (entry.isAnchorEnd) shareText += ` 🏁`;
            shareText += `\n`;
            if (i < sequence.length - 1) {
                shareText += `   🚇 ${entry.transitFromPrev.mins} min ${entry.transitFromPrev.type}\n`;
            }
            shareText += `\n`;
        });

        const totalTransit = sequence.reduce((sum, e) => sum + (e.transitFromPrev?.mins || 0), 0);
        shareText += `📊 ${sequence.length} mic${sequence.length > 1 ? 's' : ''} • ${totalTransit} min total transit\n\n`;
        shareText += `Planned with MicFinder NYC 🗽`;

        await navigator.share({
            title: 'My Mic Crawl Route',
            text: shareText
        });

        // Show success on button
        const shareBtn = document.querySelector('button[onclick="shareRoute()"]');
        showButtonSuccess(shareBtn, null, `
            <svg class="w-4 h-4 checkmark-animated" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
            <span>Shared!</span>
        `);
        showToast('Route shared!');
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Share failed:', err);
            copyRouteToClipboard();
        }
    }
}

function copyRouteToClipboard() {
    if (!currentRoute || currentRoute.sequence.length === 0) {
        showToast('No route to copy');
        return;
    }

    const { sequence, origin } = currentRoute;

    let text = `🎤 My Mic Crawl\n\n📍 From: ${origin.name || 'My Location'}\n\n`;
    sequence.forEach((entry, i) => {
        const mic = entry.mic;
        text += `${i + 1}. ${mic.venueName || mic.venue} (${minsToTime(entry.arriveBy)})\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
        const copyBtn = document.querySelector('button[onclick="copyRouteToClipboard()"]');
        showButtonSuccess(copyBtn, null, `
            <svg class="w-4 h-4 checkmark-animated" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
            <span>Copied!</span>
        `);
        showToast('Route copied to clipboard!');
    }).catch(() => {
        showToast('Could not copy route');
    });
}

function quickCopyRoute() {
    if (!currentRoute || currentRoute.sequence.length === 0) {
        showToast('No route to copy');
        return;
    }

    const { sequence, origin } = currentRoute;

    let text = `🎤 MIC CRAWL\n`;
    text += `Start: ${origin.name || 'My Location'}\n\n`;

    sequence.forEach((entry, i) => {
        const mic = entry.mic;
        text += `${i + 1}. ${minsToTime(entry.arriveBy)} - ${mic.venueName || mic.venue}\n`;
        if (mic.neighborhood) text += `   ${mic.neighborhood}`;
        if (mic.cost > 0) text += ` • $${mic.cost}`;
        else text += ` • Free`;
        text += '\n';
    });

    const totalTransit = sequence.reduce((sum, e) => sum + (e.transitFromPrev?.mins || 0), 0);
    const totalCost = sequence.reduce((sum, e) => sum + (e.mic.cost || 0), 0);

    text += `\n📊 ${sequence.length} stops • ${totalTransit}min travel`;
    if (totalCost > 0) text += ` • $${totalCost} total`;

    navigator.clipboard.writeText(text).then(() => {
        const copyBtn = document.querySelector('button[onclick="quickCopyRoute()"]');
        showButtonSuccess(copyBtn, null, `
            <svg class="w-4 h-4 checkmark-animated" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
            <span>Copied!</span>
        `);
        showToast('Route copied to clipboard!');
    }).catch(() => {
        showToast('Could not copy route');
    });
}

function saveRoute() {
    if (!currentRoute || currentRoute.sequence.length === 0) {
        showToast('No route to save');
        return;
    }

    try {
        const saved = JSON.parse(localStorage.getItem('savedRoutes') || '[]');

        const routeToSave = {
            id: Date.now(),
            date: new Date().toISOString(),
            day: document.getElementById('day-select').value,
            sequence: currentRoute.sequence.map(e => ({
                venueName: e.mic.venueName || e.mic.venue,
                neighborhood: e.mic.neighborhood,
                startTime: minsToTime(e.arriveBy),
                transitMins: e.transitFromPrev.mins,
                isAnchorStart: e.isAnchorStart,
                isAnchorMust: e.isAnchorMust,
                isAnchorEnd: e.isAnchorEnd
            })),
            origin: currentRoute.origin.name || 'My Location'
        };

        saved.push(routeToSave);

        if (saved.length > 10) {
            saved.shift();
        }

        localStorage.setItem('savedRoutes', JSON.stringify(saved));

        // Show success animation on button
        const saveBtn = document.querySelector('button[onclick="saveRoute()"]');
        showButtonSuccess(saveBtn, null, `
            <svg class="w-4 h-4 checkmark-animated" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
            <span>Saved!</span>
        `);
        showToast('Route saved to history!');

    } catch (err) {
        console.error('Save failed:', err);
        showToast('Could not save route');
    }
}
