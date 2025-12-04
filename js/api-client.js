// =============================================================================
// API CLIENT - Fetches data from MongoDB API or Google Sheets
// =============================================================================

const ApiClient = {
    /**
     * Fetch all mics from the configured data source
     * @returns {Promise<Array>} Array of mic objects
     */
    async fetchMics() {
        console.log(`📡 Fetching data from ${API_CONFIG.dataSource}...`);

        if (API_CONFIG.dataSource === 'mongodb') {
            return await this.fetchFromMongoDB();
        } else {
            return await this.fetchFromGoogleSheets();
        }
    },

    /**
     * Fetch mics from MongoDB API
     * @returns {Promise<Array>} Array of mic objects
     */
    async fetchFromMongoDB() {
        try {
            const url = `${API_CONFIG.mongodb.baseUrl}${API_CONFIG.mongodb.endpoints.mics}`;
            console.log(`📊 Fetching from MongoDB API: ${url}`);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`MongoDB API returned ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'API request failed');
            }

            console.log(`✅ Fetched ${data.count} mics from MongoDB API`);

            // Transform MongoDB documents to match frontend expected format
            return data.mics.map(mic => this.transformMongoDBMic(mic));

        } catch (error) {
            console.error('❌ Error fetching from MongoDB API:', error);
            throw error;
        }
    },

    /**
     * Transform MongoDB mic document to frontend format
     * @param {Object} mic - MongoDB document
     * @returns {Object} Transformed mic object
     */
    transformMongoDBMic(mic) {
        return {
            id: mic._id,
            name: mic.name || 'Unnamed Mic',
            venueName: mic.venueName || '',
            day: mic.day || '',
            startTime: mic.startTime || '',
            endTime: mic.endTime || null,
            borough: mic.borough || '',
            neighborhood: mic.neighborhood || '',
            address: mic.address || '',
            lat: mic.lat || 0,
            lon: mic.lon || 0,
            cost: mic.cost || 'Free',
            stageTime: mic.stageTime || '',
            signUpDetails: mic.signUpDetails || '',
            host: mic.host || '',
            environment: mic.environment || '',
            notes: mic.notes || '',
            score: mic.score || 0,
            // Add any additional fields the frontend needs
            tags: this.extractTags(mic),
            isTopPick: mic.score > 5 // Example: score > 5 = top pick
        };
    },

    /**
     * Extract tags from mic data
     * @param {Object} mic - Mic object
     * @returns {Array<string>} Array of tags
     */
    extractTags(mic) {
        const tags = [];

        if (mic.cost === 'Free' || mic.cost === '$0') {
            tags.push('Free');
        }

        if (mic.environment && mic.environment.toLowerCase().includes('pro')) {
            tags.push('Pro-Am');
        }

        if (mic.notes && mic.notes.toLowerCase().includes('supportive')) {
            tags.push('Supportive');
        }

        if (mic.notes && mic.notes.toLowerCase().includes('hot')) {
            tags.push('Hot');
        }

        return tags;
    },

    /**
     * Fetch mics from Google Sheets (legacy method)
     * @returns {Promise<Array>} Array of mic objects
     */
    async fetchFromGoogleSheets() {
        try {
            // Import the sheets-sync.js functionality if needed
            if (typeof SheetsSync !== 'undefined') {
                console.log('📊 Using Google Sheets sync...');
                return await SheetsSync.fetchAndTransform();
            } else {
                throw new Error('Google Sheets sync module not loaded');
            }
        } catch (error) {
            console.error('❌ Error fetching from Google Sheets:', error);
            throw error;
        }
    },

    /**
     * Check API health (MongoDB only)
     * @returns {Promise<Object>} Health status
     */
    async checkHealth() {
        if (API_CONFIG.dataSource !== 'mongodb') {
            return { status: 'healthy', message: 'Using Google Sheets' };
        }

        try {
            const url = `${API_CONFIG.mongodb.baseUrl}${API_CONFIG.mongodb.endpoints.health}`;
            const response = await fetch(url);
            const data = await response.json();

            console.log('🏥 API Health:', data.status);
            return data;
        } catch (error) {
            console.error('❌ Health check failed:', error);
            return { status: 'unhealthy', error: error.message };
        }
    }
};
