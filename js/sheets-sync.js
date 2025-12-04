// =============================================================================
// GOOGLE SHEETS SYNC MODULE
// =============================================================================
// Handles fetching data from Google Sheets and geocoding management

// =============================================================================
// CONFIGURATION
// =============================================================================

const SHEETS_CONFIG = {
    // Google Sheets URL - can be either:
    // 1. Shareable link: https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=0
    // 2. Direct CSV export: https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=0
    //
    // SET YOUR GOOGLE SHEETS URL HERE:
    sheetsUrl: 'https://docs.google.com/spreadsheets/d/1wROLFgLrbgP1aP_b9VIJn0QzbGzmifT9r7CV15Lw7Mw/edit?usp=sharing',

    // Google Sheets API Key (RECOMMENDED - most reliable method)
    // Get your free API key: https://console.cloud.google.com/apis/credentials
    // ⚠️ WARNING: This API key should be moved to a backend server for production!
    // ⚠️ Exposing API keys in client-side code is a security risk.
    // ⚠️ For now, ensure this key has HTTP referrer restrictions in Google Cloud Console.
    apiKey: 'AIzaSyBL_zeouBAs0g43BirfK4YIz6mfjYpraP8',

    // Sheet ID (tab) to fetch - usually 0 for first sheet
    // Find this in the URL after 'gid=' (e.g., gid=0, gid=123456)
    sheetGid: '0',

    // Sheet name/range to fetch (for API method)
    // Leave empty to fetch entire first sheet, or specify like "Sheet1!A1:Z1000"
    range: '',

    // Geocoding settings
    geocoding: {
        enabled: true,
        provider: 'nominatim', // OpenStreetMap Nominatim
        rateLimit: 1000, // 1 second between requests
        userAgent: 'MicMapApp/1.0'
    },

    // Cache settings
    cache: {
        enabled: true,
        ttl: 24 * 60 * 60 * 1000, // 24 hours
        key: 'micmap_geocoding_cache'
    }
};

// =============================================================================
// GEOCODING CACHE
// =============================================================================

class GeocodingCache {
    constructor() {
        this.cacheKey = SHEETS_CONFIG.cache.key;
        this.cache = this.loadCache();
    }

    loadCache() {
        try {
            const cached = localStorage.getItem(this.cacheKey);
            return cached ? JSON.parse(cached) : {};
        } catch (error) {
            console.error('Error loading geocoding cache:', error);
            return {};
        }
    }

    saveCache() {
        try {
            localStorage.setItem(this.cacheKey, JSON.stringify(this.cache));
        } catch (error) {
            console.error('Error saving geocoding cache:', error);
        }
    }

    get(venueName, address) {
        const key = this.makeKey(venueName, address);
        const cached = this.cache[key];

        if (!cached) return null;

        // Check if cache entry is expired
        if (SHEETS_CONFIG.cache.ttl > 0) {
            const age = Date.now() - (cached.timestamp || 0);
            if (age > SHEETS_CONFIG.cache.ttl) {
                delete this.cache[key];
                this.saveCache();
                return null;
            }
        }

        return { lat: cached.lat, lon: cached.lon };
    }

    set(venueName, address, lat, lon) {
        const key = this.makeKey(venueName, address);
        this.cache[key] = {
            lat,
            lon,
            timestamp: Date.now()
        };
        this.saveCache();
    }

    makeKey(venueName, address) {
        return `${venueName}|${address}`.toLowerCase().trim();
    }

    clear() {
        this.cache = {};
        localStorage.removeItem(this.cacheKey);
        console.log('Geocoding cache cleared');
    }

    getStats() {
        return {
            entries: Object.keys(this.cache).length,
            size: new Blob([JSON.stringify(this.cache)]).size
        };
    }
}

// =============================================================================
// GEOCODING SERVICE
// =============================================================================

class GeocodingService {
    constructor() {
        this.cache = new GeocodingCache();
        this.lastRequestTime = 0;
    }

    async geocode(venueName, address) {
        // Check cache first
        if (SHEETS_CONFIG.cache.enabled) {
            const cached = this.cache.get(venueName, address);
            if (cached) {
                console.log(`📍 Using cached coordinates for ${venueName}`);
                return cached;
            }
        }

        // Rate limiting
        await this.rateLimit();

        // Geocode using Nominatim
        try {
            // Try address first (more reliable), fallback to venue name + address
            const queries = [
                address,  // Just the address
                `${venueName}, ${address}`,  // Venue + address
                `${venueName}, New York, NY`  // Venue + city as fallback
            ];

            let results = null;
            let successfulQuery = null;

            for (const query of queries) {
                if (!query || query === ', New York, NY') continue; // Skip invalid queries

                const url = 'https://nominatim.openstreetmap.org/search';
                const params = new URLSearchParams({
                    q: query,
                    format: 'json',
                    limit: 1
                });

                const response = await fetch(`${url}?${params}`, {
                    headers: {
                        'User-Agent': SHEETS_CONFIG.geocoding.userAgent
                    }
                });

                if (response.ok) {
                    results = await response.json();
                    if (results && results.length > 0) {
                        successfulQuery = query;
                        break; // Found coordinates!
                    }
                }

                // Small delay between attempts
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            if (results && results.length > 0) {
                const lat = parseFloat(results[0].lat);
                const lon = parseFloat(results[0].lon);

                // Cache the result
                if (SHEETS_CONFIG.cache.enabled) {
                    this.cache.set(venueName, address, lat, lon);
                }

                console.log(`✅ Geocoded ${venueName}: ${lat}, ${lon}`);
                return { lat, lon };
            } else {
                console.warn(`⚠️ No coordinates found for ${venueName} (tried ${queries.length} variations)`);
                return null;
            }
        } catch (error) {
            console.error(`❌ Error geocoding ${venueName}:`, error);
            return null;
        }
    }

    async rateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const minDelay = SHEETS_CONFIG.geocoding.rateLimit;

        if (timeSinceLastRequest < minDelay) {
            const waitTime = minDelay - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime = Date.now();
    }

    clearCache() {
        this.cache.clear();
    }

    getCacheStats() {
        return this.cache.getStats();
    }
}

// =============================================================================
// GOOGLE SHEETS FETCHER
// =============================================================================

class GoogleSheetsFetcher {
    constructor() {
        this.geocoder = new GeocodingService();
    }

    /**
     * Extract spreadsheet ID from Google Sheets URL
     * @param {string} sheetsUrl - Google Sheets URL
     * @returns {string|null} Spreadsheet ID
     */
    extractSpreadsheetId(sheetsUrl) {
        const match = sheetsUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        return match ? match[1] : null;
    }

    /**
     * Fetch data using Google Sheets API v4
     * @param {string} sheetsUrl - Google Sheets URL
     * @param {string} apiKey - Google Sheets API key
     * @returns {Promise<Array>} Array of mic objects
     */
    async fetchUsingAPI(sheetsUrl, apiKey) {
        const spreadsheetId = this.extractSpreadsheetId(sheetsUrl);
        if (!spreadsheetId) {
            throw new Error('Invalid Google Sheets URL');
        }

        // Determine range - use first sheet if not specified
        // Skip first row (www.comediq.us header) by starting from row 2
        const range = SHEETS_CONFIG.range || 'A2:Z';

        // Build API URL
        const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${apiKey}`;

        console.log('📊 Fetching data using Google Sheets API v4...');

        const response = await fetch(apiUrl);
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(`API error: ${response.status} - ${error.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();

        if (!data.values || data.values.length === 0) {
            throw new Error('No data found in spreadsheet');
        }

        // Convert rows to objects using first row as headers (row 2 of the sheet)
        const headers = data.values[0];
        const rows = data.values.slice(1).map(row => {
            const obj = {};
            headers.forEach((header, index) => {
                obj[header] = row[index] || '';
            });
            return obj;
        });

        console.log(`✅ Fetched ${rows.length} rows using API`);
        return rows;
    }

    /**
     * Convert Google Sheets URL to CSV export URL
     * @param {string} sheetsUrl - Google Sheets URL (shareable or export)
     * @param {string} gid - Sheet ID (tab number)
     * @returns {string} CSV export URL
     */
    convertToCSVUrl(sheetsUrl, gid = '0') {
        if (!sheetsUrl) return null;

        // Already a CSV export URL
        if (sheetsUrl.includes('/export?format=csv')) {
            return sheetsUrl;
        }

        // Extract sheet ID from URL
        const match = sheetsUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) {
            console.error('Invalid Google Sheets URL');
            return null;
        }

        const sheetId = match[1];

        // Extract gid if present in URL
        const gidMatch = sheetsUrl.match(/[#&]gid=([0-9]+)/);
        const sheetGid = gidMatch ? gidMatch[1] : gid;

        // Construct CSV export URL
        return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${sheetGid}`;
    }

    /**
     * Fetch and parse data from Google Sheets
     * @param {string} sheetsUrl - Google Sheets URL (optional override)
     * @returns {Promise<Array>} Array of mic objects
     */
    async fetchFromSheets(sheetsUrl = SHEETS_CONFIG.sheetsUrl) {
        if (!sheetsUrl) {
            throw new Error('Google Sheets URL not configured. Set SHEETS_CONFIG.sheetsUrl in sheets-sync.js');
        }

        let parsedData = null;

        // Try Google Sheets API first (MOST RELIABLE)
        if (SHEETS_CONFIG.apiKey) {
            try {
                console.log('🔑 Using Google Sheets API v4...');
                parsedData = await this.fetchUsingAPI(sheetsUrl, SHEETS_CONFIG.apiKey);
            } catch (error) {
                console.warn('⚠️ API fetch failed:', error.message);
                console.log('Falling back to CSV export...');
            }
        } else {
            console.log('ℹ️ No API key configured, using CSV export method');
            console.log('💡 For better reliability, get a free API key at: https://console.cloud.google.com/apis/credentials');
        }

        // If API failed or not configured, try CSV export
        if (!parsedData) {
            try {
                // Convert to CSV export URL
                const csvUrl = this.convertToCSVUrl(sheetsUrl, SHEETS_CONFIG.sheetGid);
                if (!csvUrl) {
                    throw new Error('Could not convert Google Sheets URL to CSV export format');
                }

                console.log('📊 Fetching data from Google Sheets (CSV export)...');

                // Try direct fetch first
                let response = await fetch(csvUrl);

                // If direct fetch fails (CORS/auth), try with CORS proxy
                if (!response.ok) {
                    console.log('⚠️ Direct fetch failed, trying CORS proxy...');
                    const corsProxy = 'https://api.allorigins.win/raw?url=';
                    response = await fetch(corsProxy + encodeURIComponent(csvUrl));
                }

                if (!response.ok) {
                    throw new Error(`Failed to fetch Google Sheets: ${response.status}`);
                }

                const csvText = await response.text();

                // Parse CSV
                parsedData = await this.parseCSV(csvText);
                console.log(`✅ Fetched ${parsedData.length} rows from Google Sheets`);

            } catch (error) {
                console.error('❌ Error fetching from Google Sheets:', error);
                throw error;
            }
        }

        // Transform to mic objects
        const mics = await this.transformToMics(parsedData);
        console.log(`✅ Processed ${mics.length} valid mics`);

        return mics;
    }

    /**
     * Parse CSV text using Papa Parse
     * @param {string} csvText - Raw CSV text
     * @returns {Promise<Array>} Parsed data
     */
    parseCSV(csvText) {
        return new Promise((resolve, reject) => {
            if (typeof Papa === 'undefined') {
                reject(new Error('Papa Parse library not loaded'));
                return;
            }

            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    resolve(results.data);
                },
                error: (error) => {
                    reject(error);
                }
            });
        });
    }

    /**
     * Transform CSV rows to mic objects
     * @param {Array} rows - Parsed CSV rows
     * @returns {Promise<Array>} Array of mic objects
     */
    async transformToMics(rows) {
        const mics = [];
        let geocodedCount = 0;
        let cachedCount = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            // Debug: Show first row's column names
            if (i === 0) {
                console.log('📋 Available columns:', Object.keys(row));
                console.log('📋 First row data:', row);
            }

            // Map column names from your Google Sheet format
            // Your columns: "Open Mic", "Day", "Start Time", "Venue Name", "Borough", "Neighborhood", "Location", "Cost", "Stage time"
            const micName = row['Open Mic'] || row.name || row.venueName;
            const venueName = row['Venue Name'] || row.venueName || row.venue || micName;
            const address = row['Location'] || row.address || row.location || '';
            const day = row['Day'] || row.day;
            const startTime = row['Start Time'] || row.startTime || row.time;
            const borough = row['Borough'] || row.borough;
            const neighborhood = row['Neighborhood'] || row.neighborhood;
            const cost = row['Cost'] || row.cost;
            const stageTime = row['Stage time'] || row.stageTime;

            // Skip rows without required fields (but we can geocode if we have venue + address)
            if (!micName && !venueName) {
                console.log(`⚠️ Skipping row ${i + 1} - missing venue name`);
                continue;
            }

            // Skip rows that are just headers or empty
            // Valid days: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
            const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            if (!day || !validDays.includes(day.toLowerCase()) || !startTime) {
                continue; // Likely a header row or empty
            }

            // Get coordinates
            let lat = parseFloat(row.lat || row.latitude);
            let lon = parseFloat(row.lon || row.longitude);

            // If no coordinates, try to geocode
            if ((!lat || !lon || isNaN(lat) || isNaN(lon)) && SHEETS_CONFIG.geocoding.enabled) {
                const coords = await this.geocoder.geocode(venueName, address);
                if (coords) {
                    lat = coords.lat;
                    lon = coords.lon;
                    geocodedCount++;
                } else {
                    // Skip mics without coordinates
                    console.warn(`⚠️ Skipping ${micName} - no coordinates available`);
                    continue;
                }
            } else if (lat && lon) {
                cachedCount++;
            } else {
                console.warn(`⚠️ Skipping ${micName} - no valid coordinates`);
                continue;
            }

            // Create mic object
            const mic = {
                id: i + 1,
                name: micName,
                day: day,
                startTime: startTime || '7:00 PM',
                endTime: row['Latest End Time'] || row.endTime || '',

                // Location
                venueName: venueName,
                borough: borough || 'Unknown',
                neighborhood: neighborhood || 'Unknown',
                address: address,
                lat: lat,
                lon: lon,

                // Sign-up details
                signUpDetails: {
                    type: row.signUpType || 'in-person',
                    value: row.signUpInfo || row.signUpUrl || 'Check venue for details.'
                },

                // Details
                cost: cost || 'TBD',
                host: row.host || 'TBD',
                stageTime: stageTime || null,
                comics: parseInt(row.comics) || 0,
                tags: this.parseTags(row.tags),
                environment: row['Venue type'] || row.environment || 'Public Venue',
                lastUpdated: row.lastUpdated || new Date().toISOString().split('T')[0]
            };

            mics.push(mic);
        }

        console.log(`📍 Geocoding summary: ${geocodedCount} newly geocoded, ${cachedCount} from cache`);

        return mics;
    }

    /**
     * Parse tags from string or array
     * @param {string|Array} tags - Tags field
     * @returns {Array} Array of tag strings
     */
    parseTags(tags) {
        if (!tags) return [];
        if (Array.isArray(tags)) return tags;
        if (typeof tags === 'string') {
            return tags.split(',').map(t => t.trim()).filter(t => t);
        }
        return [];
    }

    /**
     * Get last sync timestamp
     * @returns {string|null} ISO timestamp or null
     */
    getLastSyncTime() {
        const timestamp = localStorage.getItem('micmap_last_sync');
        return timestamp || null;
    }

    /**
     * Save sync timestamp
     */
    saveLastSyncTime() {
        localStorage.setItem('micmap_last_sync', new Date().toISOString());
    }

    /**
     * Clear geocoding cache
     */
    clearCache() {
        this.geocoder.clearCache();
        localStorage.removeItem('micmap_last_sync');
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getCacheStats() {
        return {
            ...this.geocoder.getCacheStats(),
            lastSync: this.getLastSyncTime()
        };
    }
}

// =============================================================================
// EXPORT GLOBAL INSTANCE
// =============================================================================

const googleSheets = new GoogleSheetsFetcher();
