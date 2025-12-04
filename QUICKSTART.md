# Quick Start Guide

Get MicMap running in 10 minutes.

## Prerequisites

- Node.js 18+ installed
- A Google Cloud account
- A public Google Sheet with open mic data

## Step 1: Get Google Sheets API Access (5 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable Google Sheets API:
   - Click "APIs & Services" > "Library"
   - Search "Google Sheets API"
   - Click "Enable"
4. Create API Key:
   - Go to "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the key

## Step 2: Make Your Google Sheet Public

1. Open your Google Sheet
2. Click "Share"
3. Change to "Anyone with the link can view"
4. Copy the Sheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit
   ```

## Step 3: Configure & Run Backend (2 minutes)

```bash
cd api
npm install
cp .env.example .env
```

Edit `.env`:
```bash
GOOGLE_API_KEY=paste_your_api_key_here
SHEET_ID=paste_your_sheet_id_here
SHEET_RANGE=Sheet1!A2:Z
```

**IMPORTANT**: Update the column mapping in `server.js` line 49 to match your sheet:

```javascript
const header = ['name', 'address', 'day', 'startTime', 'notes'];
```

Start the server:
```bash
npm run dev
```

Test it: Open `http://localhost:3001/api/v1/mics` in your browser.

## Step 4: Configure & Run Frontend (1 minute)

```bash
cd ../client
npm install
cp .env.example .env
```

Edit `.env`:
```bash
VITE_API_URL=http://localhost:3001
```

Start the app:
```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

## Step 5: Deploy (Optional)

### Deploy API to Heroku

```bash
cd api
heroku login
heroku create your-unique-app-name
heroku config:set GOOGLE_API_KEY="your_key_here"
heroku config:set SHEET_ID="your_sheet_id_here"
git init
git add .
git commit -m "Deploy API"
git push heroku main
```

### Deploy Frontend to Vercel

```bash
cd ../client
npm i -g vercel
vercel login
vercel
# Follow prompts
vercel env add VITE_API_URL
# Enter: https://your-unique-app-name.herokuapp.com
vercel --prod
```

## Troubleshooting

### "403 Forbidden" error
- Make sure your Google Sheet is set to "Anyone with the link can view"
- Verify your API key is correct

### "404 Not Found" error
- Check that your SHEET_ID is correct
- Verify the SHEET_RANGE matches your sheet structure

### Frontend shows "Failed to load"
- Make sure the backend is running
- Check that VITE_API_URL is correct
- Verify CORS is enabled (it is by default)

### Data looks wrong
- Update the `header` array in `api/server.js` to match your column order
- Make sure you're skipping the header row (A2:Z, not A1:Z)

## Next Steps

1. Customize the column mapping to match your sheet
2. Test on mobile device
3. Share with 1-2 friends for feedback
4. Deploy to production
5. Validate the core hypothesis: Is this better than Google Sheets?

## Support

This is an MVP. If something breaks, check:
1. Console errors in browser DevTools
2. Server logs in your terminal
3. The README files in `/api` and `/client`
