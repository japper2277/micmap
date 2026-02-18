/* =================================================================
   MODAL - Updated for 12_11_25_venue_card.html design
   ================================================================= */

// Swipe-to-dismiss functionality for mobile
function setupModalSwipeToDismiss() {
    const card = document.querySelector('.venue-card');
    if (!card) return;

    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    function isMobile() {
        return window.matchMedia('(max-width: 639px)').matches;
    }

    card.addEventListener('touchstart', (e) => {
        if (!isMobile()) return;
        // Only start if at top of scroll
        if (card.scrollTop > 0) return;
        startY = e.touches[0].clientY;
        currentY = startY;
        isDragging = true;
        card.style.transition = 'none';
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
        if (!isDragging || !isMobile()) return;
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;

        // Only allow dragging down
        if (deltaY > 0) {
            const dampedDelta = deltaY * 0.6; // Resistance
            card.style.transform = `scale(1) translateY(${dampedDelta}px)`;
            card.style.opacity = 1 - (deltaY / 400);
        }
    }, { passive: true });

    card.addEventListener('touchend', () => {
        if (!isDragging || !isMobile()) return;
        isDragging = false;

        const deltaY = currentY - startY;
        card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

        // If dragged more than 100px down, dismiss
        if (deltaY > 100) {
            card.style.transform = `scale(0.9) translateY(100px)`;
            card.style.opacity = 0;
            setTimeout(() => {
                closeVenueModal();
                // Reset card styles after close
                card.style.transform = '';
                card.style.opacity = '';
                card.style.transition = '';
            }, 200);
        } else {
            // Snap back
            card.style.transform = 'scale(1) translateY(0)';
            card.style.opacity = 1;
        }
    }, { passive: true });
}

// DOM element references (initialized after DOM loads)
let venueModal, modalVenueName, modalAddress, modalDirections;
let modalMicTime, modalInfoRow, modalInstructions, modalActions, modalSignupBtn, modalIgBtn;
let modalTransit, modalTabs;
let modalDaytimePicker, modalDayRow, modalTimeRow, modalTimeMoreRow, modalNoMicsNotice;

// Focus trap state
let modalTriggerElement = null;
let modalFocusTrapHandler = null;

// Current mics for tab switching
let modalMicsArray = [];
let modalActiveMicIndex = 0;
let modalDayPickerState = null;

// Initialize modal DOM references
function initModal() {
    venueModal = document.getElementById('venue-modal');
    modalVenueName = document.getElementById('modal-venue-name');
    modalAddress = document.getElementById('modal-address');
    modalDirections = document.getElementById('modal-directions');
    modalMicTime = document.getElementById('modal-mic-time');
    modalInfoRow = document.getElementById('modal-info-row');
    modalInstructions = document.getElementById('modal-instructions');
    modalActions = document.getElementById('modal-actions');
    modalSignupBtn = document.getElementById('modal-signup-btn');
    modalIgBtn = document.getElementById('modal-ig-btn');
    modalTransit = document.getElementById('modal-transit');
    modalTabs = document.getElementById('modal-tabs');
    modalDaytimePicker = document.getElementById('modal-daytime-picker');
    modalDayRow = document.getElementById('modal-day-row');
    modalTimeRow = document.getElementById('modal-time-row');
    modalTimeMoreRow = document.getElementById('modal-time-more-row');
    modalNoMicsNotice = document.getElementById('modal-no-mics-notice');
    modalPlanActions = document.getElementById('modal-plan-actions');
    modalPlanBtn = document.getElementById('modal-plan-btn');

    // "+ Schedule" button click handler - adds mic to schedule without entering plan mode
    if (modalPlanBtn) {
        modalPlanBtn.addEventListener('click', () => {
            const mic = modalMicsArray[modalActiveMicIndex];
            if (!mic) return;

            // Toggle mic in/out of route
            if (typeof toggleMicInRoute === 'function') {
                toggleMicInRoute(mic.id, true); // skipZoom = true
            }

            // Close modal
            closeVenueModal();
        });
    }

    // Time button click handler in header (event delegation)
    if (modalMicTime) {
        modalMicTime.addEventListener('click', (e) => {
            // Plan mode: time-add-btn toggles schedule
            const addBtn = e.target.closest('.time-add-btn');
            if (addBtn) {
                if (addBtn.classList.contains('conflict')) return;
                const micId = addBtn.dataset.micId;
                if (micId && typeof toggleMicInRoute === 'function') {
                    toggleMicInRoute(micId, true);
                    const mic = modalMicsArray[modalActiveMicIndex];
                    if (mic) {
                        const venueName = mic.title || mic.venue;
                        const venueMics = modalVenueMap[venueName] || [mic];
                        populateModalContent(mic, venueMics);
                    }
                }
                return;
            }

            // Normal mode: time-pill switches displayed mic
            const pill = e.target.closest('.time-pill');
            if (pill) {
                const micId = pill.dataset.micId;
                if (!micId) return;
                const venueName = (modalMicsArray[modalActiveMicIndex]?.title || modalMicsArray[modalActiveMicIndex]?.venue);
                const venueMics = modalVenueMap[venueName] || [];
                const targetMic = venueMics.find(m => m.id === micId);
                if (targetMic) {
                    // Find index in modalMicsArray and switch to it
                    const idx = modalMicsArray.findIndex(m => m.id === micId);
                    if (idx !== -1) modalActiveMicIndex = idx;
                    populateModalContent(targetMic, venueMics);
                }
            }
        });
    }

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

    // Swipe-to-dismiss on mobile
    setupModalSwipeToDismiss();

    // Event delegation for alert triggers (avoids inline onclick XSS)
    document.addEventListener('click', (e) => {
        const alertTrigger = e.target.closest('.alert-trigger');
        if (alertTrigger) {
            e.stopPropagation();
            const line = alertTrigger.dataset.line;
            const alertText = alertTrigger.dataset.alert;
            if (line && alertText) {
                showAlertModal(line, alertText);
            }
        }
    });
}

// Store venue map for tab switching
let modalVenueMap = {};
const modalDayNameToIndex = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const modalTimeChipsLimit = 3;

function getModalContextDayName() {
    const now = new Date();
    if (STATE?.currentMode === 'tomorrow') return CONFIG.dayNames[(now.getDay() + 1) % 7];
    if (STATE?.currentMode === 'calendar' && STATE?.selectedCalendarDate) {
        const d = new Date(STATE.selectedCalendarDate);
        if (!isNaN(d.getTime())) return CONFIG.dayNames[d.getDay()];
    }
    return CONFIG.dayNames[now.getDay()];
}

function getClosestUpcomingDay(dayNames, fromDayName = null) {
    if (!dayNames || dayNames.length === 0) return null;
    const now = new Date();
    const currentIdx = fromDayName && modalDayNameToIndex[fromDayName] !== undefined
        ? modalDayNameToIndex[fromDayName]
        : now.getDay();

    let nearest = dayNames[0];
    let minDist = 8;
    dayNames.forEach(dayName => {
        const idx = modalDayNameToIndex[dayName];
        if (idx === undefined) return;
        const dist = (idx - currentIdx + 7) % 7;
        if (dist < minDist) {
            minDist = dist;
            nearest = dayName;
        }
    });
    return nearest;
}

function getDateForDayName(dayName, fromDate = null) {
    const idx = modalDayNameToIndex[dayName];
    if (idx === undefined) return new Date();
    const base = fromDate ? new Date(fromDate) : new Date();
    if (isNaN(base.getTime())) return new Date();
    const baseIdx = base.getDay();
    const diff = (idx - baseIdx + 7) % 7;
    base.setDate(base.getDate() + diff);
    return base;
}

function formatModalDayDate(dayName) {
    const date = getDateForDayName(dayName, STATE?.selectedCalendarDate || new Date());
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    }).format(date);
}

function sortMicsByStartTime(mics) {
    return [...mics].sort((a, b) => {
        const aTime = a.start ? a.start.getTime() : (parseTime(a.timeStr || a.startTime) || new Date(0)).getTime();
        const bTime = b.start ? b.start.getTime() : (parseTime(b.timeStr || b.startTime) || new Date(0)).getTime();
        return aTime - bTime;
    });
}

function getMicsAtVenueAcrossDays(mic) {
    if (!mic || !STATE?.mics) return [];
    const targetName = (mic.title || mic.venue || '').toLowerCase().trim();
    return STATE.mics.filter(m => {
        const sameCoords = m.lat === mic.lat && m.lng === mic.lng;
        const sameName = (m.title || m.venue || '').toLowerCase().trim() === targetName;
        return sameCoords && sameName && !m.warning;
    });
}

function renderModalTimeChips() {
    if (!modalDayPickerState || !modalTimeRow || !modalTimeMoreRow) return;
    const { dayToMics, activeDay, activeMic, expandedTimes } = modalDayPickerState;
    const dayMics = dayToMics[activeDay] || [];
    const visibleMics = dayMics.slice(0, modalTimeChipsLimit);
    const moreMics = dayMics.slice(modalTimeChipsLimit);

    const renderChip = (mic) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `modal-chip ${activeMic && mic.id === activeMic.id ? 'active-time' : ''}`;
        chip.textContent = mic.timeStr || '?';
        chip.addEventListener('click', () => {
            modalDayPickerState.activeMic = mic;
            populateModalContent(mic, dayMics, activeDay);
            renderModalTimeChips();
        });
        return chip;
    };

    modalTimeRow.innerHTML = '';
    visibleMics.forEach(m => modalTimeRow.appendChild(renderChip(m)));
    if (moreMics.length > 0) {
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'modal-chip more-chip';
        moreBtn.textContent = expandedTimes ? 'Hide' : `+${moreMics.length}`;
        moreBtn.addEventListener('click', () => {
            modalDayPickerState.expandedTimes = !modalDayPickerState.expandedTimes;
            renderModalTimeChips();
        });
        modalTimeRow.appendChild(moreBtn);
    }

    modalTimeMoreRow.innerHTML = '';
    if (moreMics.length > 0 && expandedTimes) {
        moreMics.forEach(m => modalTimeMoreRow.appendChild(renderChip(m)));
        modalTimeMoreRow.classList.add('open');
    } else {
        modalTimeMoreRow.classList.remove('open');
    }
}

function renderModalDayTimePicker(venueMicsAcrossDays, selectedMic) {
    if (!modalDaytimePicker || !modalDayRow || !modalTimeRow || !modalNoMicsNotice) return;
    const grouped = {};
    venueMicsAcrossDays.forEach(m => {
        if (!grouped[m.day]) grouped[m.day] = [];
        grouped[m.day].push(m);
    });
    Object.keys(grouped).forEach(day => grouped[day] = sortMicsByStartTime(grouped[day]));

    const availableDays = Object.keys(grouped).sort((a, b) => {
        const ai = modalDayNameToIndex[a] ?? 99;
        const bi = modalDayNameToIndex[b] ?? 99;
        return ai - bi;
    });

    if (venueMicsAcrossDays.length <= 1) {
        modalDaytimePicker.style.display = 'none';
        modalNoMicsNotice.classList.remove('show');
        modalNoMicsNotice.textContent = '';
        modalDayPickerState = null;
        return;
    }

    modalDaytimePicker.style.display = '';
    const contextDayName = getModalContextDayName();
    const hasContextDay = !!grouped[contextDayName];
    const nextAvailableDay = getClosestUpcomingDay(availableDays, contextDayName);

    // Single source of truth for active day:
    // 1) context day if available
    // 2) next available day
    // 3) selected mic day fallback
    // 4) first available day fallback
    const defaultDay = hasContextDay
        ? contextDayName
        : (nextAvailableDay ||
           (selectedMic?.day && grouped[selectedMic.day] ? selectedMic.day : availableDays[0]));
    const dayMics = grouped[defaultDay] || [];
    const defaultMic = (selectedMic && selectedMic.day === defaultDay)
        ? selectedMic
        : (dayMics[0] || selectedMic || venueMicsAcrossDays[0]);

    if (!hasContextDay) {
        const nextMic = defaultDay && grouped[defaultDay] ? grouped[defaultDay][0] : null;
        const contextDayShort = (contextDayName || '').slice(0, 3);
        const defaultDayShort = (defaultDay || '').slice(0, 3);
        modalNoMicsNotice.textContent = nextMic
            ? `No mics today (${contextDayShort}). Showing next available: ${defaultDayShort} ${nextMic.timeStr || ''}`
            : `No mics today (${contextDayShort}).`;
        modalNoMicsNotice.classList.add('show');
    } else {
        modalNoMicsNotice.classList.remove('show');
        modalNoMicsNotice.textContent = '';
    }

    modalDayPickerState = {
        dayToMics: grouped,
        activeDay: defaultDay,
        activeMic: defaultMic,
        expandedTimes: false
    };

    modalDayRow.innerHTML = '';
    availableDays.forEach(dayName => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `modal-chip ${dayName === modalDayPickerState.activeDay ? 'active-day' : ''}`;
        chip.textContent = dayName.slice(0, 3);
        chip.addEventListener('click', () => {
            const selectedDayMics = modalDayPickerState.dayToMics[dayName] || [];
            modalDayPickerState.activeDay = dayName;
            modalDayPickerState.activeMic = selectedDayMics[0] || modalDayPickerState.activeMic;
            modalDayPickerState.expandedTimes = false;

            modalDayRow.querySelectorAll('.modal-chip').forEach(c => c.classList.remove('active-day'));
            chip.classList.add('active-day');

            if (modalDayPickerState.activeMic) {
                populateModalContent(modalDayPickerState.activeMic, selectedDayMics, dayName);
            }
            renderModalTimeChips();
        });
        modalDayRow.appendChild(chip);
    });

    populateModalContent(defaultMic, dayMics, defaultDay);
    renderModalTimeChips();
}

function renderVenueModalForMic(mic) {
    const contextDayName = getModalContextDayName();
    const isCurrentDayMic = mic?.day === contextDayName;

    // Keep current-day cards simple: no day/time picker UI.
    if (isCurrentDayMic) {
        if (modalDaytimePicker) modalDaytimePicker.style.display = 'none';
        if (modalNoMicsNotice) {
            modalNoMicsNotice.classList.remove('show');
            modalNoMicsNotice.textContent = '';
        }
        modalDayPickerState = null;
        // Find all mics at the same venue for this day (enables time pills)
        const venueName = mic.title || mic.venue;
        const allAtVenue = (STATE.mics || []).filter(m =>
            (m.title === venueName || m.venue === venueName) && m.day === mic.day
        ).sort((a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0));
        populateModalContent(mic, allAtVenue.length > 0 ? allAtVenue : [mic], mic.day);
        return;
    }

    const venueMicsAcrossDays = getMicsAtVenueAcrossDays(mic);
    if (venueMicsAcrossDays.length > 0) {
        renderModalDayTimePicker(venueMicsAcrossDays, mic);
    } else {
        if (modalDaytimePicker) modalDaytimePicker.style.display = 'none';
        if (modalNoMicsNotice) {
            modalNoMicsNotice.classList.remove('show');
            modalNoMicsNotice.textContent = '';
        }
        modalDayPickerState = null;
        populateModalContent(mic, [mic], mic.day);
    }
}

// Helper: Adjust mic start time to the correct date based on viewing mode
// today = today's date, tomorrow = +1 day, calendar = selected date
function adjustMicDateForMode(mic) {
    if (!mic?.start || !(mic.start instanceof Date)) return mic;

    const mode = STATE?.currentMode || 'today';
    const now = new Date();

    // Calculate target date based on mode
    let targetDate = new Date(now);
    if (mode === 'tomorrow') {
        targetDate.setDate(targetDate.getDate() + 1);
    } else if (mode === 'calendar' && STATE?.selectedCalendarDate) {
        targetDate = new Date(STATE.selectedCalendarDate);
    }

    // When using modal day chips, always align transit timing with selected day.
    if (modalDayPickerState?.activeDay) {
        targetDate = getDateForDayName(modalDayPickerState.activeDay, STATE?.selectedCalendarDate || now);
    }

    // Create new date with target date but original time
    const adjusted = new Date(targetDate);
    adjusted.setHours(mic.start.getHours(), mic.start.getMinutes(), 0, 0);

    return { ...mic, start: adjusted };
}

// Open modal with multiple mics (shows tabs)
function openVenueModalWithMics(mics) {
    if (!mics || mics.length === 0) return;

    // Store mics for tab switching
    modalMicsArray = mics;
    modalActiveMicIndex = 0;

    // Group mics by venue name
    modalVenueMap = {};
    mics.forEach(mic => {
        const key = mic.title || mic.venue || 'Unknown';
        if (!modalVenueMap[key]) modalVenueMap[key] = [];
        modalVenueMap[key].push(mic);
    });

    // Sort each venue's mics by start time (earliest first)
    Object.values(modalVenueMap).forEach(venueMics => {
        venueMics.sort((a, b) => {
            const aTime = a.start ? a.start.getTime() : (parseTime(a.timeStr || a.startTime) || new Date(0)).getTime();
            const bTime = b.start ? b.start.getTime() : (parseTime(b.timeStr || b.startTime) || new Date(0)).getTime();
            return aTime - bTime;
        });
    });

    const venues = Object.entries(modalVenueMap);

    // If only one venue (regardless of mic count), show without tabs
    if (venues.length === 1) {
        modalTabs.innerHTML = '';
        modalTabs.style.display = 'none';
        const venueMics = venues[0][1];
        // For today, find first mic that hasn't passed (started < 30 min ago)
        // For tomorrow/calendar, use earliest mic
        const now = new Date();
        let primaryMic = venueMics[0];
        if (STATE?.currentMode === 'today') {
            const upcomingMic = venueMics.find(m => {
                if (!m.start) return false;
                const diffMins = (m.start - now) / 60000;
                return diffMins > -30; // hasn't started > 30 min ago
            });
            if (upcomingMic) primaryMic = upcomingMic;
        }
        renderVenueModalForMic(primaryMic);
        venueModal.classList.add('active');
        modalTriggerElement = document.activeElement;
        setupFocusTrap(venueModal);
        return;
    }

    // Build tabs - one per venue
    const tabsHtml = venues.map(([venueName, venueMics], idx) => {
        const shortName = typeof shortenVenueName === 'function'
            ? shortenVenueName(venueName)
            : venueName;
        const displayName = shortName.length > 14 ? shortName.substring(0, 13) + '…' : shortName;
        return `<button class="modal-tab ${idx === 0 ? 'active' : ''}" data-venue-name="${escapeHtml(venueName)}" data-tooltip="${escapeHtml(venueName)}">${escapeHtml(displayName)}</button>`;
    }).join('');

    modalTabs.innerHTML = tabsHtml;
    modalTabs.style.display = 'flex';

    // Add tab hover tooltips and click handlers
    modalTabs.querySelectorAll('.modal-tab').forEach(tab => {
        // Hover tooltip (only if text is truncated)
        tab.addEventListener('mouseenter', (e) => {
            const text = tab.dataset.tooltip;
            if (!text) return;

            // Only show if tab text differs from full name (i.e., truncated)
            const tabText = tab.textContent.trim().toUpperCase();
            const fullText = text.toUpperCase();
            if (tabText === fullText) return;

            // Create or reuse tooltip
            let tooltip = document.getElementById('tab-tooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.id = 'tab-tooltip';
                tooltip.className = 'tab-tooltip';
                document.body.appendChild(tooltip);
            }

            tooltip.textContent = text;

            // Position above the tab
            const rect = tab.getBoundingClientRect();
            tooltip.style.left = (rect.left + rect.width / 2) + 'px';
            tooltip.style.top = (rect.top - 8) + 'px';
            tooltip.style.transform = 'translate(-50%, -100%)';
            tooltip.classList.add('visible');
        });

        tab.addEventListener('mouseleave', () => {
            const tooltip = document.getElementById('tab-tooltip');
            if (tooltip) tooltip.classList.remove('visible');
        });

        // Click handler
        tab.addEventListener('click', (e) => {
            const venueName = e.target.dataset.venueName;
            if (!venueName) return;

            // Update active tab
            modalTabs.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');

            // Update modal content with all mics at this venue
            const venueMics = modalVenueMap[venueName] || [];
            if (venueMics.length > 0) {
                renderVenueModalForMic(venueMics[0]);
            }
        });
    });

    // Show first venue's mics
    const firstVenueMics = venues[0][1];
    renderVenueModalForMic(firstVenueMics[0]);

    // Show modal
    venueModal.classList.add('active');

    // Accessibility
    modalTriggerElement = document.activeElement;
    setupFocusTrap(venueModal);
}

// Populate modal content without showing it (for tab switching)
function populateModalContent(mic, allMicsAtVenue = null, activeDayName = null) {
    if (!mic) return;

    // 1. HEADER - Venue name and time(s)
    modalVenueName.innerText = mic.title || 'Unknown Venue';
    const dayName = activeDayName || mic.day || getModalContextDayName();
    const hasPicker = !!modalDayPickerState;

    // In plan mode: show clickable time buttons in header
    const micsForHeader = allMicsAtVenue || [mic];
    if (STATE.planMode && micsForHeader.length > 0) {
        // Get times of mics already in route (for conflict detection)
        const routeTimes = (STATE.route || []).map(id => {
            const m = STATE.mics.find(mic => mic.id === id);
            return m?.start?.getTime();
        }).filter(Boolean);

        const btnsHtml = micsForHeader.map(m => {
            const inRoute = STATE.route?.includes(m.id);
            // Check if same time as any mic in route (conflict)
            const hasConflict = !inRoute && routeTimes.includes(m.start?.getTime());

            // Format time nicely (e.g. "7:00")
            const h = m.start?.getHours() || 0;
            const mins = m.start?.getMinutes() || 0;
            const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
            const timeStr = mins === 0 ? `${hour}:00` : `${hour}:${mins.toString().padStart(2,'0')}`;

            let btnClass = '';
            let iconSvg = '';

            if (inRoute) {
                btnClass = ' in-route';
                // Checkmark icon
                iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            } else if (hasConflict) {
                btnClass = ' conflict';
                // No icon, just text change in CSS
            } else {
                // Plus icon
                iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
            }

            return `<button class="time-add-btn${btnClass}" data-mic-id="${m.id}">${iconSvg}<span>${timeStr}</span></button>`;
        }).join('');
        modalMicTime.innerHTML = btnsHtml;
    } else if (hasPicker) {
        modalMicTime.innerText = formatModalDayDate(dayName);
    } else if (allMicsAtVenue && allMicsAtVenue.length > 1) {
        // Normal mode with multiple times — clickable pills to switch between times
        // Check Slotted data to detect cancelled times
        const slotDataForPills = STATE.slottedSlots?.[mic.title] || STATE.slottedSlots?.[mic.venue];
        let pillTargetDate = new Date();
        if (STATE.currentMode === 'tomorrow') pillTargetDate.setDate(pillTargetDate.getDate() + 1);
        else if (STATE.currentMode === 'calendar' && STATE.selectedCalendarDate) pillTargetDate = new Date(STATE.selectedCalendarDate);
        const pillDateStr = pillTargetDate.toISOString().split('T')[0];

        const pillsHtml = allMicsAtVenue.map(m => {
            const timeStr = m.timeStr || '?';
            const isActive = m.id === mic.id;
            let cancelled = false;
            // If Slotted data exists for this venue, check if this time has a slot
            if (slotDataForPills && m.start) {
                const mh = m.start.getHours();
                const hasSlot = slotDataForPills.slots.some(s => {
                    if (s.date !== pillDateStr) return false;
                    const pm = s.time.match(/(\d+):(\d+)(am|pm)/i);
                    if (!pm) return false;
                    let sh = parseInt(pm[1]);
                    if (pm[3].toLowerCase() === 'pm' && sh !== 12) sh += 12;
                    if (pm[3].toLowerCase() === 'am' && sh === 12) sh = 0;
                    return sh === mh;
                });
                if (!hasSlot) cancelled = true;
            }
            const classes = ['time-pill'];
            if (isActive) classes.push('active');
            if (cancelled) classes.push('cancelled');
            return `<button class="${classes.join(' ')}" data-mic-id="${m.id}"${cancelled ? ' disabled' : ''}><span>${timeStr}</span>${cancelled ? '<span class="time-pill-cancelled">cancelled</span>' : ''}</button>`;
        }).join('');
        modalMicTime.innerHTML = pillsHtml;
    } else {
        modalMicTime.innerText = mic.timeStr || '';
    }

    // 2. SUB-HEADER - Address and Maps link
    let address = mic.address || '';
    address = address.replace(/,?\s*NY\s*\d{5}(-\d{4})?/i, '').trim(); // Remove zip
    address = address.replace(/,\s*$/, ''); // Remove trailing comma
    address = address.replace(/\.,/g, ','); // Fix "St.," → "St,"
    address = address.replace(/,?\s*New York(\s+City)?/gi, ', NY'); // "New York" → "NY"
    address = address.replace(/,\s*,/g, ','); // Remove double commas
    modalAddress.innerText = address;
    modalDirections.href = `https://www.google.com/maps/dir/?api=1&destination=${mic.lat},${mic.lng}`;
    modalDirections.target = '_blank';

    // 3. INFO ROW - Time pill, Price badge, Signup type
    let instructions = mic.signupInstructions || '';
    // Strip URLs (both https:// and www. formats)
    instructions = instructions.replace(/https?:\/\/[^\s]+/gi, '').trim();
    instructions = instructions.replace(/www\.[^\s]+/gi, '').trim();
    instructions = instructions.replace(/\s*(sign\s*up\s*)?(at|@)\s*$/i, '').trim();
    if (mic.signupEmail) {
        instructions = instructions.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '').trim();
        instructions = instructions.replace(/^email\s*/i, '').trim();
    }

    // Build info row with badges (matching demo design)
    const infoParts = [];
    const clockIcon = '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';

    // 1. Set time badge (neutral)
    if (mic.setTime) {
        infoParts.push(`<div class="info-badge info-badge-time">${clockIcon} ${escapeHtml(formatSetTime(mic.setTime))}</div>`);
    }

    // 2. Price badge (money green)
    if (mic.price) {
        const priceLower = mic.price.toLowerCase();
        if (priceLower === 'free' || priceLower.includes('free')) {
            infoParts.push(`<div class="info-badge info-badge-price">FREE</div>`);
        } else if (mic.price.includes('$')) {
            const priceMatch = mic.price.match(/\$[\d]+(?:\.\d{2})?/);
            const priceAmount = priceMatch ? priceMatch[0] : mic.price.replace(/\.$/, '');
            infoParts.push(`<div class="info-badge info-badge-price">${escapeHtml(priceAmount)}</div>`);
        }
    }

    // 3. Signup type badge (coral/red)
    // Skip signup badge for URL signups to avoid duplicating the "Sign Up Online" CTA button
    if (!mic.signupUrl) {
        const signupType = mic.signupEmail ? 'RSVP' : 'Sign up in person';
        infoParts.push(`<div class="info-badge info-badge-signup">${escapeHtml(signupType)}</div>`);
    }

    modalInfoRow.innerHTML = infoParts.join('');

    // 4. NOTE TEXT - Show only important signup setup instructions
    const normalizedNote = instructions.replace(/\s+/g, ' ').trim();
    const lowerNote = normalizedNote.toLowerCase();

    const genericOnlyPatterns = [
        /^sign\s*up(\s*(in person|at venue|online))?(\s*only)?$/i,
        /^show up go up$/i,
        /^check venue for details$/i,
        /^check instagram for signup (info|link)$/i,
        /^no signup info available$/i
    ];

    const hasSpecificTiming = /\b(\d{1,2}(:\d{2})?\s*(am|pm)|minutes?\s+prior|starts?\s+at|day before|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(normalizedNote);
    const hasSpecificMethod = /\b(comment|dm|instagram post|waitlist|eventbrite|google sheet|register|text\b|link in instagram bio|link on instagram|form)\b/i.test(normalizedNote);
    const hasSpecificLocation = /\b(blue room|main room|upstairs|downstairs|back room)\b/i.test(normalizedNote);
    const isGenericOnly = genericOnlyPatterns.some(pattern => pattern.test(lowerNote));
    const shouldShowInstruction = normalizedNote.length >= 3 && !isGenericOnly && (hasSpecificTiming || hasSpecificMethod || hasSpecificLocation);

    if (shouldShowInstruction) {
        const noteText = normalizedNote.charAt(0).toUpperCase() + normalizedNote.slice(1);
        modalInstructions.textContent = noteText;
    } else {
        modalInstructions.textContent = '';
    }

    // 4. ACTION BUTTONS
    // Build spots label from Slotted data
    let spotsLabel = '';
    const slottedData = STATE.slottedSlots?.[mic.title] || STATE.slottedSlots?.[mic.venue];
    if (slottedData && mic.start) {
        let targetDate = new Date();
        if (STATE.currentMode === 'tomorrow') targetDate.setDate(targetDate.getDate() + 1);
        else if (STATE.currentMode === 'calendar' && STATE.selectedCalendarDate) targetDate = new Date(STATE.selectedCalendarDate);
        const dateStr = targetDate.toISOString().split('T')[0];
        const micHour = mic.start.getHours();
        const matchedSlot = slottedData.slots.find(s => {
            if (s.date !== dateStr) return false;
            const m = s.time.match(/(\d+):(\d+)(am|pm)/i);
            if (!m) return false;
            let h = parseInt(m[1]);
            if (m[3].toLowerCase() === 'pm' && h !== 12) h += 12;
            if (m[3].toLowerCase() === 'am' && h === 12) h = 0;
            return h === micHour;
        });
        if (matchedSlot) {
            spotsLabel = matchedSlot.spotsLeft === 0
                ? '<br><span class="signup-spots">FULL</span>'
                : `<br><span class="signup-spots">${matchedSlot.spotsLeft} spots left</span>`;
        }
    }
    const hasSignupUrl = !!mic.signupUrl;
    const hasSignupEmail = !!mic.signupEmail;
    const igHandle = mic.contact || mic.host || mic.hostIg;
    const hasIg = igHandle && igHandle !== 'TBD';

    if (hasSignupUrl) {
        modalSignupBtn.href = mic.signupUrl;
        modalSignupBtn.target = '_blank';
        modalSignupBtn.innerHTML = 'Sign Up Online' + spotsLabel;
        modalSignupBtn.style.display = 'flex';
    } else if (hasSignupEmail) {
        modalSignupBtn.href = `mailto:${mic.signupEmail}`;
        modalSignupBtn.removeAttribute('target');
        modalSignupBtn.innerText = 'Send Email';
        modalSignupBtn.style.display = 'flex';
    } else {
        modalSignupBtn.style.display = 'none';
    }

    if (hasIg) {
        modalIgBtn.href = `https://instagram.com/${igHandle.replace(/^@/, '')}`;
        modalIgBtn.target = '_blank';
        modalIgBtn.style.display = 'flex';
    } else {
        modalIgBtn.style.display = 'none';
    }

    const hasSignupAction = hasSignupUrl || hasSignupEmail;

    // Schedule button: show current state (unless in plan mode with time pills)
    if (modalPlanBtn) {
        if (STATE.planMode) {
            modalPlanBtn.style.display = 'none';
        } else {
            modalPlanBtn.style.display = 'flex';
            const isInRoute = STATE.route?.includes(mic.id);
            modalPlanBtn.textContent = isInRoute ? 'Scheduled \u2713' : '+ Schedule';
            modalPlanBtn.classList.toggle('btn-scheduled', isInRoute);
        }
    }

    // Action stack layout: hide signup row if no signup action
    modalActions.classList.remove('single-btn');
    if (!hasSignupAction) {
        modalActions.classList.add('single-btn');
    }
    modalActions.style.display = (hasSignupAction || hasIg) ? 'grid' : 'none';

    // 5. TRANSIT - adjust mic date for current viewing mode
    loadModalArrivals(adjustMicDateForMode(mic));
}


function openVenueModal(mic) {
    if (!mic) return;

    // Clear tabs for single mic
    modalTabs.innerHTML = '';
    modalTabs.style.display = 'none';
    modalMicsArray = [mic];
    modalActiveMicIndex = 0;
    renderVenueModalForMic(mic);

    // Show modal
    venueModal.classList.add('active');

    // Accessibility: Focus trap and management
    modalTriggerElement = document.activeElement;
    setupFocusTrap(venueModal);

}

// Setup focus trap for modal accessibility
function setupFocusTrap(modal) {
    // Find all focusable elements in modal
    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    // Small delay to ensure modal content is rendered
    setTimeout(() => {
        const focusableElements = modal.querySelectorAll(focusableSelectors);
        const focusableArray = Array.from(focusableElements).filter(el => {
            return el.offsetParent !== null && !el.disabled;
        });

        if (focusableArray.length === 0) return;

        const firstFocusable = focusableArray[0];
        const lastFocusable = focusableArray[focusableArray.length - 1];

        // Focus first element
        firstFocusable.focus();

        // Remove old handler if exists
        if (modalFocusTrapHandler) {
            modal.removeEventListener('keydown', modalFocusTrapHandler);
        }

        // Create focus trap handler
        modalFocusTrapHandler = (e) => {
            if (e.key !== 'Tab') return;

            // Re-query in case modal content changed
            const currentFocusable = Array.from(modal.querySelectorAll(focusableSelectors))
                .filter(el => el.offsetParent !== null && !el.disabled);

            if (currentFocusable.length === 0) return;

            const first = currentFocusable[0];
            const last = currentFocusable[currentFocusable.length - 1];

            if (e.shiftKey) {
                // Shift+Tab: if on first, go to last
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                // Tab: if on last, go to first
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        modal.addEventListener('keydown', modalFocusTrapHandler);
    }, 100);
}

// Get route - always fetch fresh for modal to get current train times
async function getRouteForModal(mic, userLat, userLng) {
    // Always fetch fresh route when opening modal
    // Cached routes from card rendering may have stale scheduledDepartureTimes
    // Cards use cache for speed, modal uses fresh for accuracy
    const route = await transitService.fetchSubwayRoute(userLat, userLng, mic.lat, mic.lng, mic);
    if (route) {
        return { routes: [route], schedule: null };
    }
    return { routes: [], schedule: null };
}

// Walking icon SVG (gray)
const walkIcon = '<svg class="walk-icon" width="14" height="14" fill="#8e8e93" viewBox="0 0 24 24"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7z"/></svg>';

// Helper: Format time range (e.g., "11:15 AM - 11:36 AM")
// If route has scheduledDeparture/scheduledArrival, use those (schedule-based)
// If mic is provided, calculate based on mic start time (arrive 15 min early)
// Otherwise fall back to "leave now" calculation
function formatTimeRange(durationMins, route = null, mic = null) {
    const formatTime = (d) => new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(d);

    // Always calculate based on mic start time if available (most accurate)
    if (mic?.start instanceof Date) {
        const mins = (typeof durationMins === 'number' && !isNaN(durationMins)) ? durationMins : 15;
        const now = new Date();
        const targetArrival = new Date(mic.start.getTime() - 15 * 60000); // Arrive 15 min early
        let departure = new Date(targetArrival.getTime() - mins * 60000);

        // Don't show departure times in the past - use "now" and recalculate arrival
        if (departure < now) {
            departure = now;
            const arrival = new Date(now.getTime() + mins * 60000);
            return `${formatTime(departure)} - ${formatTime(arrival)}`;
        }
        return `${formatTime(departure)} - ${formatTime(targetArrival)}`;
    }

    // Fallback: "leave now" calculation
    const mins = (typeof durationMins === 'number' && !isNaN(durationMins)) ? durationMins : 15;
    const now = new Date();
    const end = new Date(now.getTime() + mins * 60000);
    return `${formatTime(now)} - ${formatTime(end)}`;
}

// Helper: Find station by name and line
function findStationByName(stationName, line) {
    if (!window.TRANSIT_DATA?.stations) return null;

    // Normalize the station name for matching
    const normalizedName = stationName.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const station of window.TRANSIT_DATA.stations) {
        // Extract station name without the lines part
        const baseStationName = station.name.replace(/\s*\([^)]+\)/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

        // Check if names match and if the line is at this station
        if (baseStationName.includes(normalizedName) || normalizedName.includes(baseStationName)) {
            const stationLines = station.name.match(/\(([^)]+)\)/);
            if (stationLines) {
                const lines = stationLines[1].split(' ');
                if (lines.includes(line)) {
                    return station;
                }
            }
        }
    }

    // Fallback: try partial match
    for (const station of window.TRANSIT_DATA.stations) {
        const baseStationName = station.name.replace(/\s*\([^)]+\)/, '').toLowerCase();
        if (baseStationName.includes(stationName.toLowerCase().split(' ')[0])) {
            const stationLines = station.name.match(/\(([^)]+)\)/);
            if (stationLines && stationLines[1].split(' ').includes(line)) {
                return station;
            }
        }
    }

    return null;
}

// Helper: Show alert modal
function showAlertModal(line, alertText) {
    const modal = document.getElementById('alertModal');
    const badge = document.getElementById('alert-badge');
    const title = document.getElementById('alert-title');
    const text = document.getElementById('alert-text');

    badge.className = `alert-modal-badge b-${line}`;
    badge.innerText = line;
    title.innerText = 'Service Alert';
    text.innerText = alertText;
    modal.classList.add('show');
}

// Display subway routes in new card format
async function displaySubwayRoutes(routes, mic, walkOption = null, schedule = null) {
    if (!routes || routes.length === 0) {
        modalTransit.innerHTML = '<div class="empty-card">No routes found</div>';
        return;
    }

    let transitHTML = '';

    // Walking option card (if under 1 mile)
    if (walkOption) {
        const distDisplay = walkOption.directDist < 0.2
            ? `${(walkOption.directDist * 5280).toFixed(0)} ft`
            : `${walkOption.directDist.toFixed(2)} mi`;

        transitHTML += `
            <div class="card-base">
                <div class="card-top">
                    <span class="time-main">${formatTimeRange(walkOption.walkMins, null, mic)}</span>
                    <span class="duration-main">${walkOption.walkMins} min</span>
                </div>
                <div class="card-mid">
                    <span>${walkIcon} Start</span>
                    <span class="arrow">→</span>
                    <div class="badge-pill-green">Walk</div>
                    <span class="arrow">→</span>
                    <span>${distDisplay}</span>
                </div>
                <div class="card-bottom">
                    <div class="station-name">
                        <span class="station-prefix">Route:</span> Direct
                    </div>
                    <div class="status-text">No transit needed</div>
                </div>
            </div>
        `;
    }

    // Subway route cards
    for (const route of routes) {
        // Skip routes without ride legs (defensive - backend should filter these)
        const rideLegs = (route.legs || []).filter(l => l.type === 'ride');
        if (rideLegs.length === 0) {
            continue;
        }

        // Build icon flow from legs
        let iconFlow = '<span>' + walkIcon + route.walkToStation + 'm</span>';
        let firstLine = null;
        let originStationId = null;

        route.legs.forEach((leg, legIdx) => {
            if (leg.type === 'ride') {
                const lines = [leg.line, ...(leg.altLines || [])];
                if (!firstLine) {
                    firstLine = leg.line;
                    originStationId = leg.fromId;
                }
                // Check if this leg has alerts
                const hasAlert = route.alerts && route.alerts.some(a =>
                    a.lines && a.lines.some(l => lines.includes(l))
                );
                const alertText = hasAlert ? route.alerts.find(a => a.lines && a.lines.some(l => lines.includes(l)))?.text : '';

                iconFlow += '<span class="arrow">→</span>';

                // Add badge for each line (all wrapped consistently for spacing)
                lines.forEach((line, lineIdx) => {
                    if (hasAlert && lineIdx === 0) {
                        // Use data attributes to avoid XSS - event handler will read them
                        iconFlow += `<div class="badge-wrap alert-trigger" data-line="${escapeAttr(line)}" data-alert="${escapeAttr(alertText)}">
                            <div class="badge b-${escapeHtml(line)}">${escapeHtml(line)}</div>
                            <div class="alert-dot"></div>
                        </div>`;
                    } else {
                        iconFlow += `<div class="badge-wrap">
                            <div class="badge b-${escapeHtml(line)}">${escapeHtml(line)}</div>
                        </div>`;
                    }
                });
            }
        });

        // Add final walk
        iconFlow += `<span class="arrow">→</span><span>${walkIcon}${route.walkToVenue}m</span>`;

        // Get first ride leg for station name
        const firstRideLeg = route.legs.find(l => l.type === 'ride');
        const originStation = firstRideLeg?.from || route.originStation || 'Nearby station';

        // Use wait times from API (already calculated with real-time + GTFS fallback)
        const waitTime = route.waitTime || 0;
        const adjustedTotalTime = route.adjustedTotalTime ?? route.totalTime ?? 15;

        // Get train departure times and calculate actual departure/arrival
        const walkToStation = route.walkToStation || 0;
        const walkFromStation = route.walkToVenue || 0;
        const rideTime = Math.max(0, (route.totalTime || adjustedTotalTime) - walkToStation - walkFromStation);

        let depTimesStr = '';
        let displayTimeRange = '';
        let displayDuration = adjustedTotalTime;

        const formatT = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        // Priority 1: Use backend's scheduledDepartureTimes but filter based on CURRENT mic's start time
        if (route.scheduledDepartureTimes && route.scheduledDepartureTimes.length > 0 && mic?.start instanceof Date) {
            const now = new Date();

            // Calculate deadline: need to arrive at mic 15 min early
            const targetArrival = new Date(mic.start.getTime() - 15 * 60000);
            // Latest train departure = target arrival - ride time - walk from station
            const latestTrainDeparture = new Date(targetArrival.getTime() - (rideTime + walkFromStation) * 60000);

            // Filter trains: must be catchable (after walk to station) AND before deadline
            const walkBuffer = walkToStation <= 3 ? walkToStation : (walkToStation - 2);
            const earliestCatchableNow = new Date(now.getTime() + walkBuffer * 60000);
            const trainDepartures = route.scheduledDepartureTimes
                .filter(iso => {
                    const trainTime = new Date(iso);
                    return trainTime >= earliestCatchableNow && trainTime <= latestTrainDeparture;
                });

            // If trains found, use them; otherwise fall through to other options
            if (trainDepartures.length > 0) {
                // Use FIRST catchable train for departure time (earliest the user can leave)
                const firstTrain = new Date(trainDepartures[0]);
                let departure = new Date(firstTrain.getTime() - walkToStation * 60000);

                // Don't show departure times in the past - use "now" if needed
                if (departure < now) {
                    departure = now;
                }

                // Use LAST valid train for arrival calculation
                const lastTrain = new Date(trainDepartures[trainDepartures.length - 1]);
                const arrival = new Date(lastTrain.getTime() + (rideTime + walkFromStation) * 60000);

                displayTimeRange = `${formatT(departure)} - ${formatT(arrival)}`;
                displayDuration = Math.round((arrival - departure) / 60000);
                depTimesStr = trainDepartures.map(iso => formatT(new Date(iso))).join(', ');
            }
        }
        // Priority 2: Need to leave within 30 min - use real-time MTA (only if Priority 1 didn't find trains)
        // Departure = mic start - 15 min early - transit time
        if (!displayTimeRange && firstLine && originStationId && mic?.start instanceof Date) {
            const departureTime = mic.start.getTime() - 15 * 60000 - adjustedTotalTime * 60000;
            const minsToDepart = (departureTime - Date.now()) / 60000;

            if (minsToDepart <= 30) {
                try {
                    const [arrivalsN, arrivalsS] = await Promise.all([
                        mtaService.fetchArrivals(firstLine, originStationId + 'N').catch(() => []),
                        mtaService.fetchArrivals(firstLine, originStationId + 'S').catch(() => [])
                    ]);
                    const allArrivals = [...(arrivalsN || []), ...(arrivalsS || [])];
                    const seen = new Set();
                    const unique = allArrivals.filter(a => seen.has(a.minsAway) ? false : seen.add(a.minsAway));
                    unique.sort((a, b) => a.minsAway - b.minsAway);
                    // Filter to only trains the user can catch after walking to station
                    const walkBuffer = walkToStation <= 3 ? walkToStation : (walkToStation - 2);
                    const catchable = unique.filter(a => a.minsAway >= walkBuffer);
                    const trainDepartures = catchable.slice(0, 3).map(a => new Date(Date.now() + a.minsAway * 60000).toISOString());

                    if (trainDepartures.length > 0) {
                        const firstTrain = new Date(trainDepartures[0]);
                        let departure = new Date(firstTrain.getTime() - walkToStation * 60000);

                        // Don't show departure times in the past
                        const now = new Date();
                        if (departure < now) {
                            departure = now;
                        }

                        const arrival = new Date(firstTrain.getTime() + (rideTime + walkFromStation) * 60000);

                        displayTimeRange = `${formatT(departure)} - ${formatT(arrival)}`;
                        displayDuration = Math.round((arrival - departure) / 60000);
                        depTimesStr = trainDepartures.map(iso => formatT(new Date(iso))).join(', ');
                    }
                } catch (e) {
                    console.warn('Failed to fetch MTA arrivals:', e);
                }
            }
        }

        // Fallback
        if (!displayTimeRange) {
            displayTimeRange = formatTimeRange(adjustedTotalTime, route, mic);
        }
        if (!depTimesStr) {
            // Calculate departure based on mic start time, not cached route times
            if (mic?.start instanceof Date) {
                const targetArrival = new Date(mic.start.getTime() - 15 * 60000); // Arrive 15 min early
                const targetDeparture = new Date(targetArrival.getTime() - adjustedTotalTime * 60000);
                const now = new Date();

                if (targetDeparture >= now) {
                    depTimesStr = formatT(targetDeparture);
                } else {
                    depTimesStr = 'Leave now';
                }
            } else if (route.scheduledDeparture) {
                const scheduledDep = new Date(route.scheduledDeparture);
                const now = new Date();
                const walkBuffer = walkToStation <= 3 ? walkToStation : (walkToStation - 2);
                const earliestCatchable = new Date(now.getTime() + walkBuffer * 60000);

                if (scheduledDep >= earliestCatchable) {
                    depTimesStr = formatT(scheduledDep);
                } else {
                    depTimesStr = 'Check schedule';
                }
            } else {
                depTimesStr = 'Check schedule';
            }
        }

        transitHTML += `
            <div class="card-base">
                <div class="card-top">
                    <span class="time-main">${displayTimeRange}</span>
                    <span class="duration-main">${displayDuration} min</span>
                </div>
                <div class="card-mid">
                    ${iconFlow}
                </div>
                <div class="card-bottom">
                    <div class="station-name">
                        <span class="station-prefix">From:</span> ${originStation}
                    </div>
                    <div class="dep-times">${depTimesStr}</div>
                </div>
            </div>
        `;
    }

    // Safety net: if all route cards were skipped (no catchable trains), show fallback
    if (!transitHTML && !walkOption) {
        transitHTML = '<div class="empty-card">No catchable trains</div>';
    }

    modalTransit.innerHTML = transitHTML;
}

// Load live train arrivals for venue's nearest stations
async function loadModalArrivals(mic) {
    if (!modalTransit) return;

    // Check if user has set their location (transit mode)
    const hasUserOrigin = STATE?.userOrigin?.lat && STATE?.userOrigin?.lng;
    if (!hasUserOrigin) {
        modalTransit.innerHTML = '';
        return;
    }

    // Show skeleton loading state
    modalTransit.innerHTML = `
        <div class="transit-skeleton">
            <div class="skeleton-card">
                <div class="skeleton-row">
                    <div class="skeleton-line medium"></div>
                    <div class="skeleton-line short"></div>
                </div>
                <div class="skeleton-row">
                    <div class="skeleton-badges">
                        <div class="skeleton-badge"></div>
                        <div class="skeleton-badge"></div>
                    </div>
                </div>
                <div class="skeleton-row">
                    <div class="skeleton-line long"></div>
                </div>
            </div>
        </div>`;

    const originLat = STATE.userOrigin.lat;
    const originLng = STATE.userOrigin.lng;

    // Thresholds based on actual walking distance
    const WALK_ONLY_THRESHOLD = 0.5; // miles - under this, just walk
    const SHOW_WALK_OPTION = 1.0;    // miles - under this, show walk as an option

    // Get walking time AND distance from OSRM (local Docker, falls back to public)
    let walkMins, walkDist;
    try {
        const walkData = await transitService.getWalkingTime(originLat, originLng, mic.lat, mic.lng);
        walkMins = walkData.mins;
        walkDist = walkData.miles;
    } catch (e) {
        // Fallback to straight-line estimate
        const straightDist = calculateDistance(originLat, originLng, mic.lat, mic.lng);
        walkDist = straightDist * 1.3; // Manhattan factor ~1.3x
        walkMins = Math.ceil(walkDist * 20); // 20 min/mile
    }

    // Under 0.5 miles actual walk - just show walking card
    if (walkDist <= WALK_ONLY_THRESHOLD) {
        const distDisplay = walkDist < 0.2
            ? `${(walkDist * 5280).toFixed(0)} ft`
            : `${walkDist.toFixed(2)} mi`;

        modalTransit.innerHTML = `
            <div class="card-base">
                <div class="card-top">
                    <span class="time-main">${formatTimeRange(walkMins, null, mic)}</span>
                    <span class="duration-main">${walkMins} min</span>
                </div>
                <div class="card-mid">
                    <span>${walkIcon} Start</span>
                    <span class="arrow">→</span>
                    <div class="badge-pill-green">Walk</div>
                    <span class="arrow">→</span>
                    <span>${distDisplay}</span>
                </div>
                <div class="card-bottom">
                    <div class="station-name">
                        <span class="station-prefix">Route:</span> Direct
                    </div>
                    <div class="status-text">No transit needed</div>
                </div>
            </div>
        `;
        return;
    }

    // Get route (uses cache from card calculation if available)
    let routes = [];
    let schedule = null;
    try {
        const result = await getRouteForModal(mic, originLat, originLng);
        routes = result.routes || [];
        schedule = result.schedule || null;
    } catch (error) {
        // Route fetch failed - will fall back to station arrivals
    }

    // Display routes with walking option if under 1 mile actual walk
    if (routes && routes.length > 0) {
        await displaySubwayRoutes(routes, mic, walkDist < SHOW_WALK_OPTION ? { walkMins, directDist: walkDist } : null, schedule);
        return;
    }

    // No subway routes but walkable - show walk-only card
    if (walkDist < SHOW_WALK_OPTION) {
        const distDisplay = walkDist < 0.2
            ? `${(walkDist * 5280).toFixed(0)} ft`
            : `${walkDist.toFixed(2)} mi`;

        modalTransit.innerHTML = `
            <div class="card-base">
                <div class="card-top">
                    <span class="time-main">${formatTimeRange(walkMins, null, mic)}</span>
                    <span class="duration-main">${walkMins} min</span>
                </div>
                <div class="card-mid">
                    <span>${walkIcon} Start</span>
                    <span class="arrow">→</span>
                    <div class="badge-pill-green">Walk</div>
                    <span class="arrow">→</span>
                    <span>${distDisplay}</span>
                </div>
                <div class="card-bottom">
                    <div class="station-name">
                        <span class="station-prefix">Route:</span> Direct
                    </div>
                    <div class="status-text">No transit needed</div>
                </div>
            </div>
        `;
        return;
    }

    // Fallback: Find 2 nearest stations to USER's origin and show arrivals
    const nearestStations = findNearestStations(originLat, originLng, 2);
    if (!nearestStations || nearestStations.length === 0) {
        modalTransit.innerHTML = '<div class="empty-card">No nearby stations</div>';
        return;
    }

    // Fetch alerts once for all stations
    const alerts = mtaService.alertsCache || await mtaService.fetchAlerts() || [];

    let transitHTML = '';

    // Process each station
    for (const station of nearestStations) {
        const lineMatch = station.name.match(/\(([^)]+)\)/);
        if (!lineMatch) continue;

        const lines = lineMatch[1].split(' ').filter(l => l.length > 0);
        const stationName = station.name.replace(/\s*\([^)]+\)/, '');

        // Calculate walk time using OSRM
        let stationWalkMins;
        try {
            const walkData = await transitService.getWalkingTime(originLat, originLng, station.lat, station.lng);
            stationWalkMins = walkData.mins;
        } catch (e) {
            const walkMiles = calculateDistance(originLat, originLng, station.lat, station.lng);
            stationWalkMins = Math.ceil(walkMiles * 20);
        }

        // Fetch arrivals for ALL lines at this station
        let allArrivals = [];
        const linesWithService = new Set();

        for (const line of lines) {
            try {
                const lineArrivals = await mtaService.fetchArrivals(line, station.gtfsStopId);
                if (lineArrivals && lineArrivals.length > 0) {
                    lineArrivals.forEach(a => a.line = line);
                    allArrivals.push(...lineArrivals);
                    linesWithService.add(line);
                }
            } catch (e) {
                // Line has no service right now
            }
        }

        allArrivals.sort((a, b) => a.minsAway - b.minsAway);

        // Filter out trains user can't catch
        const minCatchableTime = stationWalkMins <= 3 ? stationWalkMins : (stationWalkMins - 2);
        const catchableArrivals = allArrivals.filter(a => a.minsAway >= minCatchableTime);

        // Get next 3 arrivals
        const nextArrivals = catchableArrivals.slice(0, 3);
        const timesStr = nextArrivals.length > 0
            ? nextArrivals.map(a => a.minsAway === 0 ? 'Now' : a.minsAway + 'm').join(', ')
            : 'No trains';

        // Check for alerts on this station's lines
        const stationAlerts = alerts.filter(alert =>
            alert.lines && alert.lines.some(l => lines.includes(l))
        );
        const hasAlert = stationAlerts.length > 0;
        const alertText = hasAlert ? stationAlerts[0].text : '';

        // Build badge flow
        const displayLines = linesWithService.size > 0
            ? [...linesWithService].slice(0, 3)
            : lines.slice(0, 1);

        let badgeFlow = `<span>${walkIcon}${stationWalkMins || 0}m</span><span class="arrow">→</span>`;
        displayLines.forEach((line, idx) => {
            if (hasAlert && idx === 0) {
                // Use data attributes to avoid XSS - event handler will read them
                badgeFlow += `<div class="badge-wrap alert-trigger" data-line="${escapeAttr(line)}" data-alert="${escapeAttr(alertText)}">
                    <div class="badge b-${escapeHtml(line)}">${escapeHtml(line)}</div>
                    <div class="alert-dot"></div>
                </div>`;
            } else {
                badgeFlow += `<div class="badge-wrap">
                    <div class="badge b-${escapeHtml(line)}">${escapeHtml(line)}</div>
                </div>`;
            }
        });

        // Estimate total time (walk + wait + ride estimate)
        const waitTime = nextArrivals.length > 0 ? (nextArrivals[0].minsAway || 0) : 5;
        const rideEstimate = 15; // Rough estimate
        const safeWalkMins = stationWalkMins || 0;
        const totalTime = safeWalkMins + waitTime + rideEstimate;

        transitHTML += `
            <div class="card-base">
                <div class="card-top">
                    <span class="time-main">${formatTimeRange(totalTime, null, mic)}</span>
                    <span class="duration-main">~${totalTime} min</span>
                </div>
                <div class="card-mid">
                    ${badgeFlow}
                </div>
                <div class="card-bottom">
                    <div class="station-name">
                        <span class="station-prefix">From:</span> ${stationName}
                    </div>
                    <div class="dep-times">${timesStr}</div>
                </div>
            </div>
        `;
    }

    modalTransit.innerHTML = transitHTML || '<div class="empty-card">No transit info available</div>';
}

// Find nearest stations to a lat/lng (returns array)
function findNearestStations(lat, lng, count = 2) {
    if (!window.TRANSIT_DATA?.stations) return [];

    // Calculate distance to each station and sort
    const stationsWithDist = window.TRANSIT_DATA.stations.map(station => ({
        ...station,
        dist: calculateDistance(lat, lng, station.lat, station.lng)
    }));

    stationsWithDist.sort((a, b) => a.dist - b.dist);

    return stationsWithDist.slice(0, count);
}

function closeVenueModal() {
    venueModal.classList.remove('active');

    // Accessibility: Remove focus trap and restore focus
    if (modalFocusTrapHandler) {
        venueModal.removeEventListener('keydown', modalFocusTrapHandler);
        modalFocusTrapHandler = null;
    }

    // Return focus to trigger element
    if (modalTriggerElement && modalTriggerElement.focus) {
        modalTriggerElement.focus();
        modalTriggerElement = null;
    }
}
