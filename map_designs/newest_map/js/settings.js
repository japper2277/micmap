/* =================================================================
   SETTINGS SERVICE
   User preferences stored in localStorage
   ================================================================= */

const settingsService = {
    modal: null,

    init() {
        this.createModal();
    },

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'settings-modal-overlay';
        this.modal.id = 'settings-modal';
        this.modal.innerHTML = `
            <div class="settings-modal">
                <div class="settings-header">
                    <h2>Settings</h2>
                    <button class="settings-close" onclick="settingsService.close()">&times;</button>
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
                </div>
            </div>
        `;
        document.body.appendChild(this.modal);

        // Set initial value
        const currentPref = STATE.walkPreference || '15min';
        const radio = this.modal.querySelector(`input[value="${currentPref}"]`);
        if (radio) radio.checked = true;

        // Listen for changes
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
            this.modal.classList.add('active');
        }
    },

    close() {
        if (this.modal) {
            this.modal.classList.remove('active');
        }
    }
};
