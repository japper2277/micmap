// =============================================================================
// API SERVICE
// =============================================================================
// Handles fetching data from backend API with fallback to mock data

const API_CONFIG = {
    baseURL: 'http://localhost:3001/api/v1',
    endpoints: {
        mics: '/mics'
    },
    timeout: 10000, // 10 seconds
    retryAttempts: 3,
    retryDelay: 1000 // 1 second
};

// =============================================================================
// API CLIENT
// =============================================================================

class MicMapAPI {
    constructor() {
        this.cache = {
            mics: null,
            timestamp: null,
            ttl: 5 * 60 * 1000 // 5 minutes cache
        };
    }

    /**
     * Fetch mics from API with caching and error handling
     * @returns {Promise<Array>} Array of mic objects
     */
    async fetchMics() {
        // Check cache first
        if (this.isCacheValid()) {
            console.log('Using cached mic data');
            return this.cache.mics;
        }

        try {
            console.log('Fetching mics from API...');
            const response = await this.fetchWithTimeout(
                `${API_CONFIG.baseURL}${API_CONFIG.endpoints.mics}`,
                { method: 'GET' },
                API_CONFIG.timeout
            );

            if (!response.ok) {
                throw new Error(`API returned ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.mics || !Array.isArray(data.mics)) {
                throw new Error('Invalid API response format');
            }

            // Transform API data to match our mic object structure
            const transformedMics = this.transformAPIData(data.mics);

            // Update cache
            this.cache.mics = transformedMics;
            this.cache.timestamp = Date.now();

            console.log(`Successfully loaded ${transformedMics.length} mics from API`);
            return transformedMics;

        } catch (error) {
            console.warn('API fetch failed:', error.message);
            console.log('Falling back to mock data...');

            // Fallback to mock data
            if (typeof mockMics !== 'undefined') {
                return mockMics;
            }

            throw new Error('No data available: API failed and no mock data found');
        }
    }

    /**
     * Transform API data to match our internal mic object structure
     * @param {Array} apiMics - Raw data from API
     * @returns {Array} Transformed mic objects
     */
    transformAPIData(apiMics) {
        return apiMics.map((apiMic, index) => {
            // Parse address to get coordinates if not provided
            const coords = this.parseCoordinates(apiMic);

            return {
                id: apiMic.id || index + 1,
                name: apiMic.name || apiMic.venueName || 'Unknown Mic',
                day: apiMic.day || 'Monday',
                startTime: apiMic.startTime || '7:00 PM',
                endTime: apiMic.endTime || null,
                borough: apiMic.borough || 'Manhattan',
                neighborhood: apiMic.neighborhood || 'Unknown',
                lat: coords.lat,
                lon: coords.lon,
                signUpDetails: this.parseSignUpDetails(apiMic),
                cost: apiMic.cost || 'Free',
                host: apiMic.host || 'N/A',
                stageTime: apiMic.stageTime || null,
                comics: apiMic.comics || Math.floor(Math.random() * 20) + 5, // Random if not provided
                tags: this.parseTags(apiMic),
                environment: apiMic.environment || 'Public Venue',
                lastUpdated: apiMic.lastUpdated || new Date().toISOString().split('T')[0]
            };
        });
    }

    /**
     * Parse coordinates from API data or geocode address
     * @param {Object} apiMic - Raw mic data
     * @returns {Object} {lat, lon}
     */
    parseCoordinates(apiMic) {
        // If API provides lat/lon directly
        if (apiMic.lat && apiMic.lon) {
            return {
                lat: parseFloat(apiMic.lat),
                lon: parseFloat(apiMic.lon)
            };
        }

        // If API provides latitude/longitude
        if (apiMic.latitude && apiMic.longitude) {
            return {
                lat: parseFloat(apiMic.latitude),
                lon: parseFloat(apiMic.longitude)
            };
        }

        // Try to get coordinates from venue address lookup
        const venueName = apiMic.name || apiMic.venueName;

        // Check if we have a street address for this venue
        if (typeof getVenueAddress === 'function') {
            const streetAddress = getVenueAddress(venueName);
            if (streetAddress) {
                console.log(`📍 Found address for ${venueName}: ${streetAddress}`);
                // Return placeholder - will need to geocode these addresses once
                // For now, mark them so we know they can be geocoded
            }
        }

        // If we have venue name, neighborhood, and borough, we can geocode later
        if (venueName && apiMic.neighborhood && apiMic.borough) {
            console.warn(`⚠️ No coordinates for ${venueName} - needs geocoding`);
            console.log(`   Location: ${apiMic.neighborhood}, ${apiMic.borough}`);
        } else {
            console.warn(`❌ No coordinates for ${venueName} - insufficient location data`);
        }

        // Return default NYC coordinates (temporary until geocoded)
        return {
            lat: 40.7128 + (Math.random() - 0.5) * 0.1, // Random near NYC
            lon: -74.0060 + (Math.random() - 0.5) * 0.1
        };
    }

    /**
     * Parse sign-up details from API data
     * @param {Object} apiMic - Raw mic data
     * @returns {Object} {type, value}
     */
    parseSignUpDetails(apiMic) {
        if (apiMic.signUpUrl) {
            return {
                type: 'url',
                value: apiMic.signUpUrl
            };
        }

        if (apiMic.signUpEmail) {
            return {
                type: 'email',
                value: apiMic.signUpEmail
            };
        }

        if (apiMic.signUpInfo || apiMic.signUpDetails) {
            return {
                type: 'in-person',
                value: apiMic.signUpInfo || apiMic.signUpDetails
            };
        }

        return {
            type: 'in-person',
            value: 'Sign up at venue'
        };
    }

    /**
     * Parse tags from API data
     * @param {Object} apiMic - Raw mic data
     * @returns {Array} Array of tag strings
     */
    parseTags(apiMic) {
        if (apiMic.tags && Array.isArray(apiMic.tags)) {
            return apiMic.tags;
        }

        if (apiMic.tags && typeof apiMic.tags === 'string') {
            return apiMic.tags.split(',').map(tag => tag.trim());
        }

        return [];
    }

    /**
     * Check if cached data is still valid
     * @returns {boolean}
     */
    isCacheValid() {
        if (!this.cache.mics || !this.cache.timestamp) {
            return false;
        }

        const age = Date.now() - this.cache.timestamp;
        return age < this.cache.ttl;
    }

    /**
     * Clear the cache
     */
    clearCache() {
        this.cache.mics = null;
        this.cache.timestamp = null;
        console.log('Cache cleared');
    }

    /**
     * Fetch with timeout
     * @param {string} url - URL to fetch
     * @param {Object} options - Fetch options
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<Response>}
     */
    async fetchWithTimeout(url, options, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    }

    /**
     * Health check
     * @returns {Promise<boolean>}
     */
    async healthCheck() {
        try {
            const response = await this.fetchWithTimeout(
                `${API_CONFIG.baseURL.replace('/api/v1', '')}/health`,
                { method: 'GET' },
                5000
            );
            return response.ok;
        } catch (error) {
            console.warn('API health check failed:', error.message);
            return false;
        }
    }
}

// =============================================================================
// EXPORT API INSTANCE
// =============================================================================

const micMapAPI = new MicMapAPI();
