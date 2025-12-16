/* =================================================================
   SETTINGS SERVICE
   User preferences stored in localStorage
   ================================================================= */

const settingsService = {
    modal: null,
    triggerElement: null,
    focusTrapHandler: null,

    init() {
        this.createModal();
    },

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'settings-modal-overlay';
        this.modal.id = 'settings-modal';
        this.modal.innerHTML = `
            <div class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
                <div class="settings-header">
                    <h2 id="settings-title">Settings</h2>
                    <button class="settings-close" onclick="settingsService.close()" aria-label="Close settings">&times;</button>
                </div>
                <div class="settings-content">
                    <div class="settings-section">
                        <h3>Walking Threshold</h3>
                        <p class="settings-description">How far are you willing to walk?</p>
                        <div class="settings-options" id="walk-options">
                            <label class="settings-option">
                                <input type="radio" name="walkPref" value="10min">
                                <span class="option-label">10 min</span>
                                <span class="option-detail">~0.5 miles</span>
                            </label>
                            <label class="settings-option">
                                <input type="radio" name="walkPref" value="15min">
                                <span class="option-label">15 min</span>
                                <span class="option-detail">~0.75 miles</span>
                            </label>
                            <label class="settings-option">
                                <input type="radio" name="walkPref" value="20min">
                                <span class="option-label">20 min</span>
                                <span class="option-detail">~1.0 miles</span>
                            </label>
                            <label class="settings-option">
                                <input type="radio" name="walkPref" value="none">
                                <span class="option-label">Always transit</span>
                                <span class="option-detail">Show all times</span>
                            </label>
                        </div>
                    </div>
                    <div class="settings-section">
                        <h3>List Order</h3>
                        <p class="settings-description">Where to show mics that already started</p>
                        <label class="settings-toggle">
                            <input type="checkbox" id="happeningNowFirst">
                            <span class="toggle-switch"></span>
                            <span class="toggle-label">Show "Happening Now" at top</span>
                        </label>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(this.modal);

        // Set initial values
        const currentPref = STATE.walkPreference || '15min';
        const radio = this.modal.querySelector(`input[value="${currentPref}"]`);
        if (radio) radio.checked = true;

        const happeningNowCheckbox = this.modal.querySelector('#happeningNowFirst');
        if (happeningNowCheckbox) {
            happeningNowCheckbox.checked = STATE.showHappeningNowFirst || false;
        }

        // Listen for walk preference changes
        this.modal.querySelectorAll('input[name="walkPref"]').forEach(input => {
            input.addEventListener('change', (e) => {
                STATE.walkPreference = e.target.value;
                localStorage.setItem('walkPref', e.target.value);

                // Recalculate if in transit mode
                if (STATE.isTransitMode && STATE.userOrigin) {
                    // Re-run transit calculation with current origin
                    transitService.calculateFromOrigin(
                        STATE.userOrigin.lat,
                        STATE.userOrigin.lng,
                        STATE.userOrigin.name
                    );
                }
            });
        });

        // Listen for happening now toggle
        if (happeningNowCheckbox) {
            happeningNowCheckbox.addEventListener('change', (e) => {
                STATE.showHappeningNowFirst = e.target.checked;
                localStorage.setItem('showHappeningNowFirst', e.target.checked);
                render(STATE.currentMode); // Re-render list
            });
        }

        // Close on overlay click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                this.close();
            }
        });
    },

    open() {
        if (this.modal) {
            // Save trigger element to return focus on close
            this.triggerElement = document.activeElement;

            this.modal.classList.add('active');

            // Set up focus trap
            this.setupFocusTrap();
        }
    },

    close() {
        if (this.modal) {
            this.modal.classList.remove('active');

            // Remove focus trap handler
            if (this.focusTrapHandler) {
                const modalContent = this.modal.querySelector('.settings-modal');
                if (modalContent) {
                    modalContent.removeEventListener('keydown', this.focusTrapHandler);
                }
                this.focusTrapHandler = null;
            }

            // Return focus to trigger element
            if (this.triggerElement && this.triggerElement.focus) {
                this.triggerElement.focus();
                this.triggerElement = null;
            }
        }
    },

    setupFocusTrap() {
        const modalContent = this.modal.querySelector('.settings-modal');
        if (!modalContent) return;

        // Focus the first focusable element after a brief delay for animation
        setTimeout(() => {
            const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
            const focusableElements = modalContent.querySelectorAll(focusableSelectors);
            const focusableArray = Array.from(focusableElements).filter(el => !el.disabled && el.offsetParent !== null);

            if (focusableArray.length === 0) return;

            const firstFocusable = focusableArray[0];
            const lastFocusable = focusableArray[focusableArray.length - 1];

            // Focus first element
            firstFocusable.focus();

            // Trap focus within modal
            this.focusTrapHandler = (e) => {
                if (e.key !== 'Tab') return;

                if (e.shiftKey) {
                    // Shift+Tab: if on first element, go to last
                    if (document.activeElement === firstFocusable) {
                        e.preventDefault();
                        lastFocusable.focus();
                    }
                } else {
                    // Tab: if on last element, go to first
                    if (document.activeElement === lastFocusable) {
                        e.preventDefault();
                        firstFocusable.focus();
                    }
                }
            };

            modalContent.addEventListener('keydown', this.focusTrapHandler);
        }, 100);
    }
};
