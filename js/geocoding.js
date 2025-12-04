// =============================================================================
// GEOCODING SERVICE - Convert addresses to coordinates
// =============================================================================

const GeocodingService = {
    // Configuration
    provider: 'nominatim', // Options: 'nominatim' (free), 'google', 'mapbox'
    apiKeys: {
        google: '', // Add your Google Maps API key here
        mapbox: ''  // Add your Mapbox API key here
    },

    // Rate limiting for free services
    lastRequestTime: 0,
    minRequestInterval: 1000, // 1 second for Nominatim

    /**
     * Clean venue name for better geocoding results
     */
    cleanVenueName(venueName) {
        // Remove time suffixes like "(Evening)", "(Late)", "(Afternoon)"
        let cleaned = venueName.replace(/\s*\((Evening|Late|Afternoon|Early)\)\s*/gi, '').trim();

        // Remove extra spaces
        cleaned = cleaned.replace(/\s+/g, ' ');

        return cleaned;
    },

    /**
     * Geocode a venue address to get coordinates
     * @param {string} venueName - Name of the venue
     * @param {string} neighborhood - Neighborhood name
     * @param {string} borough - Borough (Manhattan, Brooklyn, etc.)
     * @returns {Promise<{lat: number, lon: number, display_name: string}>}
     */
    async geocode(venueName, neighborhood, borough) {
        // Clean the venue name
        const cleanName = this.cleanVenueName(venueName);

        console.log(`🔍 Geocoding: ${cleanName}, ${neighborhood}, ${borough}`);

        // Check if we have a street address for this venue
        let streetAddress = null;
        if (typeof getVenueAddress === 'function') {
            streetAddress = getVenueAddress(venueName);
        }

        // Try multiple search strategies in order of specificity
        const strategies = [];

        // If we have a street address, try that first (most accurate)
        if (streetAddress) {
            strategies.push(streetAddress);
            console.log(`  📍 Found street address: ${streetAddress}`);
        }

        // Add other strategies
        strategies.push(
            // Strategy: Full address with neighborhood
            `${cleanName}, ${neighborhood}, ${borough}, New York City, NY`,
            // Strategy: Just venue name and borough
            `${cleanName}, ${borough}, New York, NY`,
            // Strategy: Venue name with NYC
            `${cleanName}, New York, NY`
        );

        let lastError = null;

        for (let i = 0; i < strategies.length; i++) {
            const address = strategies[i];

            try {
                console.log(`  Attempt ${i + 1}/${strategies.length}: "${address}"`);

                let result;
                switch (this.provider) {
                    case 'nominatim':
                        result = await this.geocodeNominatim(address);
                        break;
                    case 'google':
                        result = await this.geocodeGoogle(address);
                        break;
                    case 'mapbox':
                        result = await this.geocodeMapbox(address);
                        break;
                    default:
                        throw new Error(`Unknown provider: ${this.provider}`);
                }

                // Verify the result is in NYC (roughly)
                // NYC bounds: lat 40.4-40.95, lon -74.3 to -73.7
                if (result.lat >= 40.4 && result.lat <= 40.95 &&
                    result.lon >= -74.3 && result.lon <= -73.7) {
                    console.log(`  ✅ Success with strategy ${i + 1}`);
                    return result;
                } else {
                    console.log(`  ⚠️ Result outside NYC bounds, trying next strategy...`);
                    lastError = new Error(`Result outside NYC bounds`);
                }
            } catch (error) {
                console.log(`  ❌ Strategy ${i + 1} failed: ${error.message}`);
                lastError = error;
                // Continue to next strategy
            }
        }

        // All strategies failed
        throw lastError || new Error(`No results found for: ${cleanName}`);
    },

    /**
     * Nominatim (OpenStreetMap) - FREE, no API key required
     */
    async geocodeNominatim(address) {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            await new Promise(resolve =>
                setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
            );
        }
        this.lastRequestTime = Date.now();

        const url = new URL('https://nominatim.openstreetmap.org/search');
        url.searchParams.set('q', address);
        url.searchParams.set('format', 'json');
        url.searchParams.set('limit', '1');
        url.searchParams.set('addressdetails', '1');

        const response = await fetch(url.toString(), {
            headers: {
                'User-Agent': 'MicMap/1.0' // Required by Nominatim
            }
        });

        if (!response.ok) {
            throw new Error(`Nominatim error: ${response.status}`);
        }

        const data = await response.json();
        if (data.length === 0) {
            throw new Error(`No results found for: ${address}`);
        }

        return {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
            display_name: data[0].display_name,
            source: 'nominatim'
        };
    },

    /**
     * Google Maps Geocoding API - Most accurate, requires API key
     */
    async geocodeGoogle(address) {
        if (!this.apiKeys.google) {
            throw new Error('Google Maps API key not configured');
        }

        const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        url.searchParams.set('address', address);
        url.searchParams.set('key', this.apiKeys.google);

        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.status !== 'OK') {
            throw new Error(`Google Geocoding error: ${data.status}`);
        }

        const result = data.results[0];
        return {
            lat: result.geometry.location.lat,
            lon: result.geometry.location.lng,
            display_name: result.formatted_address,
            source: 'google'
        };
    },

    /**
     * Mapbox Geocoding API - Good balance, requires API key
     */
    async geocodeMapbox(address) {
        if (!this.apiKeys.mapbox) {
            throw new Error('Mapbox API key not configured');
        }

        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`;
        const urlObj = new URL(url);
        urlObj.searchParams.set('access_token', this.apiKeys.mapbox);
        urlObj.searchParams.set('limit', '1');

        const response = await fetch(urlObj.toString());
        const data = await response.json();

        if (!data.features || data.features.length === 0) {
            throw new Error(`No results found for: ${address}`);
        }

        const result = data.features[0];
        return {
            lat: result.center[1],
            lon: result.center[0],
            display_name: result.place_name,
            source: 'mapbox'
        };
    },

    /**
     * Batch geocode multiple venues
     * @param {Array} venues - Array of venue objects with name, neighborhood, borough
     * @returns {Promise<Array>} - Array of geocoded results
     */
    async geocodeBatch(venues) {
        const results = [];

        for (let i = 0; i < venues.length; i++) {
            const venue = venues[i];
            console.log(`Geocoding ${i + 1}/${venues.length}: ${venue.name}`);

            try {
                const coords = await this.geocode(
                    venue.name,
                    venue.neighborhood,
                    venue.borough
                );
                results.push({
                    ...venue,
                    ...coords,
                    success: true
                });
            } catch (error) {
                console.error(`❌ Failed to geocode ${venue.name}:`, error.message);
                results.push({
                    ...venue,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }
};

// =============================================================================
// HELPER FUNCTION: Update your data.js file with real coordinates
// =============================================================================

/**
 * Run this in browser console to geocode all venues and update coordinates
 */
async function updateAllCoordinates() {
    console.log('🚀 Starting geocoding process...');

    // Get unique venues (some venues have multiple time slots)
    const uniqueVenues = new Map();
    mockMics.forEach(mic => {
        const key = `${mic.name}-${mic.neighborhood}-${mic.borough}`;
        if (!uniqueVenues.has(key)) {
            uniqueVenues.set(key, {
                name: mic.name,
                neighborhood: mic.neighborhood,
                borough: mic.borough
            });
        }
    });

    const venues = Array.from(uniqueVenues.values());
    console.log(`📍 Found ${venues.length} unique venues to geocode`);

    // Geocode all venues
    const results = await GeocodingService.geocodeBatch(venues);

    // Display results
    console.log('\n📊 GEOCODING RESULTS:');
    console.log('='.repeat(80));

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ Successful: ${successful.length}`);
    console.log(`❌ Failed: ${failed.length}`);

    if (failed.length > 0) {
        console.log('\n❌ Failed venues:');
        failed.forEach(f => {
            console.log(`  - ${f.name}: ${f.error}`);
        });
    }

    // Generate updated data.js code
    console.log('\n📝 COPY THE COORDINATES BELOW TO UPDATE YOUR data.js FILE:');
    console.log('='.repeat(80));

    const venueCoords = {};
    successful.forEach(result => {
        const key = `${result.name}-${result.neighborhood}-${result.borough}`;
        venueCoords[key] = {
            lat: result.lat,
            lon: result.lon
        };
    });

    console.log('// Geocoded coordinates:');
    console.log('const venueCoordinates = {');
    Object.entries(venueCoords).forEach(([key, coords]) => {
        console.log(`  "${key}": { lat: ${coords.lat}, lon: ${coords.lon} },`);
    });
    console.log('};');

    return results;
}

// =============================================================================
// MANUAL GEOCODING FUNCTION (for individual lookups)
// =============================================================================

/**
 * Manually geocode a single venue
 * Usage in console: geocodeVenue("The Grisly Pear", "Greenwich Village", "Manhattan")
 */
async function geocodeVenue(venueName, neighborhood, borough) {
    try {
        const result = await GeocodingService.geocode(venueName, neighborhood, borough);
        console.log('✅ Geocoded successfully:');
        console.log(`   Lat: ${result.lat}`);
        console.log(`   Lon: ${result.lon}`);
        console.log(`   Full address: ${result.display_name}`);
        return result;
    } catch (error) {
        console.error('❌ Geocoding failed:', error.message);
        return null;
    }
}
