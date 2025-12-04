# 🗺️ MicMap Geocoding Guide

## How to Get Real Coordinates for Your Venues

This guide will help you automatically geocode all your venues to get accurate latitude/longitude coordinates.

---

## Quick Start (Easiest Method - Free)

### Step 1: Find Missing Venue Addresses (Optional but Recommended)

1. **Open `find-addresses.html` in your browser**
   - This shows which venues already have street addresses
   - Click "Search on Google Maps" for missing venues
   - Copy the street address from Google Maps
   - Add it to `js/venue-addresses.js`

**Why do this?** Street addresses give the most accurate geocoding results!

### Step 2: Use the Geocoding Helper

1. **Open the helper page**
   - Open `geocode-helper.html` in your browser
   - It will automatically load your venues from `data.js`

2. **Choose your provider**
   - **Nominatim (OpenStreetMap)** - FREE, no API key needed (recommended for starting)
   - **Google Maps** - Most accurate, requires API key
   - **Mapbox** - 100,000 free requests/month, requires API key

3. **Test a single venue (optional)**
   - Enter a venue name, neighborhood, and borough
   - Click "Test Single Venue"
   - Verify the coordinates look correct

4. **Geocode all venues**
   - Click "Geocode All Venues"
   - Wait for processing (about 1 second per venue with Nominatim)
   - The tool will automatically:
     - Try street addresses first (if available)
     - Fall back to venue name + neighborhood
     - Try multiple search strategies
     - Verify results are in NYC
   - Copy the coordinates from the results

5. **Update your data.js**
   - Copy the coordinates from the results
   - Paste them into your venue objects in `data.js`
   - Replace the existing `lat` and `lon` values

---

## Option 2: Use Browser Console

1. **Open your site in browser**
   ```bash
   open prod.html
   ```

2. **Open Developer Console**
   - Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)

3. **Test a single venue**
   ```javascript
   // Try geocoding one venue first
   await geocodeVenue("The Grisly Pear", "Greenwich Village", "Manhattan")
   ```

4. **Geocode all venues**
   ```javascript
   // Process all venues
   const results = await updateAllCoordinates()
   ```

5. **Copy the output**
   - The console will display updated coordinates
   - Copy them and update your `data.js` file

---

## Provider Comparison

| Provider | Cost | API Key? | Accuracy | Rate Limit | Best For |
|----------|------|----------|----------|------------|----------|
| **Nominatim** | Free | No ❌ | Good | 1 req/sec | Getting started |
| **Google Maps** | Free tier | Yes ✅ | Excellent | 40k/month | Production |
| **Mapbox** | Free tier | Yes ✅ | Great | 100k/month | High volume |

---

## Getting API Keys (Optional)

### Google Maps Geocoding API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable "Geocoding API"
4. Create credentials (API Key)
5. Add the key to `js/geocoding.js`:
   ```javascript
   apiKeys: {
       google: 'YOUR_GOOGLE_API_KEY_HERE'
   }
   ```

### Mapbox Geocoding API

1. Go to [Mapbox](https://www.mapbox.com/)
2. Sign up for a free account
3. Go to [Account → Tokens](https://account.mapbox.com/access-tokens/)
4. Copy your default public token
5. Add the key to `js/geocoding.js`:
   ```javascript
   apiKeys: {
       mapbox: 'YOUR_MAPBOX_TOKEN_HERE'
   }
   ```

---

## Manual Geocoding (No Code)

If you prefer not to use the automated tools:

### Using Google Maps

1. Go to [Google Maps](https://www.google.com/maps)
2. Search for the venue address
3. Right-click on the location
4. Click "What's here?"
5. Copy the coordinates (format: `40.7303, -74.0022`)
6. Update your `data.js`:
   ```javascript
   lat: 40.7303,
   lon: -74.0022,
   ```

---

## Example: Updating data.js

**Before:**
```javascript
{
    id: 1,
    name: "The Grisly Pear (Evening)",
    borough: "Manhattan",
    neighborhood: "Greenwich Village",
    lat: 40.7303,  // Old/estimated coordinates
    lon: -74.0022,
    // ... rest of data
}
```

**After geocoding:**
```javascript
{
    id: 1,
    name: "The Grisly Pear (Evening)",
    borough: "Manhattan",
    neighborhood: "Greenwich Village",
    lat: 40.730321,  // Real geocoded coordinates
    lon: -74.002190,
    // ... rest of data
}
```

---

## Troubleshooting

### "No results found" error
- **Solution**: Try adding more context to the address
- Example: Instead of "The Grisly Pear", try "The Grisly Pear Bar"

### Rate limit errors (429)
- **Solution**: Use Nominatim (has built-in rate limiting) or wait between requests

### Inaccurate coordinates
- **Solution**: Switch to Google Maps provider for better accuracy
- Or manually verify coordinates using Google Maps

### API key not working
- **Solution**: Make sure the API is enabled in your provider's console
- Check that there are no billing/quota issues

---

## Need Help?

1. Test with a single venue first
2. Check the browser console for detailed error messages
3. Try a different geocoding provider
4. Manually geocode using Google Maps as a backup

---

## What's New - Improved Geocoding

The geocoding service now includes:

✅ **Multiple fallback strategies** - Tries different search queries if one fails
✅ **Street address support** - Uses precise addresses when available
✅ **NYC bounds verification** - Ensures results are actually in NYC
✅ **Smart name cleaning** - Removes "(Evening)", "(Late)" etc. automatically
✅ **Address finder tool** - Easy way to look up missing addresses

## Files Created

- `js/geocoding.js` - Geocoding service with 3 providers + fallback strategies
- `js/venue-addresses.js` - Street address lookup table (pre-filled with real addresses!)
- `geocode-helper.html` - User-friendly web interface
- `find-addresses.html` - Tool to find missing venue addresses
- `GEOCODING_GUIDE.md` - This guide (you're reading it!)

---

Happy mapping! 🎤🗺️
