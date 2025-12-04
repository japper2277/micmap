# Google Sheets API Setup Guide

Get your map automatically syncing with Google Sheets in **2 minutes**!

## Why You Need This

- ✅ **100% Free Forever** - No billing, no credit card needed
- ✅ **Auto-updates** - Map fetches latest data on every page load
- ✅ **Reliable** - Official Google API, no CORS issues
- ✅ **Secure** - API key can be restricted to your domain

## Step-by-Step Instructions

### 1. Create Google Cloud Project (30 seconds)

1. Go to: https://console.cloud.google.com/projectcreate
2. Enter project name: `MicMap` (or any name you want)
3. Click **"Create"**
4. **DO NOT** add billing/payment method (keep it 100% free!)

### 2. Enable Google Sheets API (15 seconds)

1. Go to: https://console.cloud.google.com/apis/library/sheets.googleapis.com
2. Click **"Enable"**
3. Wait 5 seconds for it to enable

### 3. Create API Key (30 seconds)

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click **"+ Create Credentials"** at the top
3. Select **"API Key"**
4. Copy the API key (looks like: `AIzaSyC...`)

### 4. Restrict API Key (RECOMMENDED for security)

1. After creating the key, click **"Edit API key"**
2. Under **"API restrictions"**:
   - Select **"Restrict key"**
   - Check **only** "Google Sheets API"
   - Click **"Save"**

3. (Optional) Under **"Application restrictions"**:
   - Select **"HTTP referrers (web sites)"**
   - Add your domain (e.g., `yourdomain.com/*`)
   - Click **"Save"**

### 5. Add API Key to Your Map (15 seconds)

1. Open: `js/sheets-sync.js`
2. Find line ~21: `apiKey: '',`
3. Paste your API key:
   ```javascript
   apiKey: 'AIzaSyC...your-key-here...',
   ```
4. Save the file

### 6. Test It! (5 seconds)

1. Refresh your map in the browser
2. Open browser console (Right-click → Inspect → Console)
3. You should see:
   ```
   🔑 Using Google Sheets API v4...
   ✅ Fetched X rows using API
   ✅ Processed X valid mics
   ```

---

## Troubleshooting

### "API key not valid"
- Make sure you enabled the Google Sheets API
- Check that you copied the entire key (starts with `AIza`)
- Wait 1-2 minutes after creating the key

### "Permission denied"
- Make sure your Google Sheet is set to "Anyone with the link can view"
- Check Sheet → Share → Anyone with link → Viewer

### Still having issues?
- Clear browser cache and try again
- Check browser console for error messages
- Verify the Sheet URL is correct in `sheets-sync.js`

---

## Free Tier Limits

**Your quota (100% free forever):**
- 60,000 requests per minute per project
- ~86 million requests per day
- **NO CREDIT CARD NEEDED**

**Your actual usage:**
- ~100-1,000 requests per day
- Uses < 0.01% of free quota

**You will NEVER be charged** as long as you don't add billing to your Google Cloud project.

---

## What Happens Next?

Once configured:
1. ✅ Map automatically fetches latest data from your Sheet on every page load
2. ✅ New venues are geocoded automatically (and cached)
3. ✅ Users always see fresh data
4. ✅ Zero manual work required!

---

## Security Best Practices

✅ **Restrict your API key** to only Google Sheets API
✅ **Add HTTP referrer restrictions** to your domain
✅ **Never commit API key** to public GitHub repos (add to .gitignore)
✅ **Regenerate key** if accidentally exposed

---

Need help? Check the Google Cloud Console or browser console for error messages!
