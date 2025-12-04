# MicMap Testing Checklist

Use this checklist to verify everything works before deploying.

## Pre-Flight Setup

- [ ] Node.js 18+ installed (`node --version`)
- [ ] Google Cloud project created
- [ ] Google Sheets API enabled
- [ ] API Key generated
- [ ] Google Sheet is public ("Anyone with the link can view")
- [ ] Sheet ID copied from URL

## Backend Tests (Local)

### Setup
- [ ] `cd api` and `npm install` completed successfully
- [ ] `.env` file created from `.env.example`
- [ ] `GOOGLE_API_KEY` set in `.env`
- [ ] `SHEET_ID` set in `.env`
- [ ] `SHEET_RANGE` set correctly (e.g., `Sheet1!A2:Z`)
- [ ] Column header array in `server.js` matches your sheet

### Functionality
- [ ] `npm run dev` starts server without errors
- [ ] Server shows: "MicMap API is running on port 3001"
- [ ] Health endpoint works: `http://localhost:3001/health` returns JSON
- [ ] Mics endpoint works: `http://localhost:3001/api/v1/mics` returns data
- [ ] Response has correct structure:
  - [ ] `success: true`
  - [ ] `count: <number>`
  - [ ] `lastUpdated: <timestamp>`
  - [ ] `mics: [array of objects]`
- [ ] Each mic object has expected fields (name, address, etc.)
- [ ] No 403 errors (check sheet permissions)
- [ ] No 404 errors (check sheet ID)

## Frontend Tests (Local)

### Setup
- [ ] `cd client` and `npm install` completed successfully
- [ ] `.env` file created from `.env.example`
- [ ] `VITE_API_URL=http://localhost:3001` set in `.env`
- [ ] Backend is still running

### Functionality
- [ ] `npm run dev` starts without errors
- [ ] App opens at `http://localhost:3000`
- [ ] Page title shows "MicMap - Open Mic Finder"
- [ ] Header displays "Open Mics"
- [ ] Skeleton loaders appear while loading
- [ ] Data loads within 2 seconds
- [ ] Mic cards display correctly with:
  - [ ] Mic name (bold, large)
  - [ ] Day and time
  - [ ] Address
  - [ ] Notes (if present)
- [ ] Footer shows "Found X open mics"
- [ ] "Last updated" timestamp displays

### Mobile Responsiveness
- [ ] Open DevTools (F12)
- [ ] Toggle device toolbar (Ctrl+Shift+M / Cmd+Shift+M)
- [ ] Test on iPhone SE (375px):
  - [ ] Text is readable
  - [ ] Cards fit width
  - [ ] No horizontal scrolling
- [ ] Test on iPad (768px):
  - [ ] Layout looks good
  - [ ] Cards have proper spacing

### Error Handling
- [ ] Stop the backend server
- [ ] Refresh frontend
- [ ] Error message displays: "Failed to load open mics"
- [ ] Restart backend, refresh frontend
- [ ] Data loads correctly again

## Production Deployment Tests

### Backend (Heroku)
- [ ] `heroku create your-app-name` succeeds
- [ ] Environment variables set:
  - [ ] `GOOGLE_API_KEY`
  - [ ] `SHEET_ID`
  - [ ] `SHEET_RANGE`
- [ ] `git push heroku main` deploys successfully
- [ ] Health endpoint works: `https://your-app.herokuapp.com/health`
- [ ] Mics endpoint works: `https://your-app.herokuapp.com/api/v1/mics`
- [ ] Data matches local version

### Frontend (Vercel)
- [ ] `vercel` deploys successfully
- [ ] Environment variable `VITE_API_URL` set to Heroku URL
- [ ] `vercel --prod` deploys production build
- [ ] Production URL works
- [ ] Data loads correctly
- [ ] Mobile view works on real device

## User Acceptance Tests

### The "Comedian Test"
Put yourself in the shoes of a comedian looking for an open mic:

- [ ] Open app on mobile device
- [ ] Page loads in under 3 seconds
- [ ] You can immediately see available mics
- [ ] Information is clear and scannable
- [ ] No need to zoom or scroll horizontally
- [ ] This is easier than opening Google Sheets

### The "Trust Test"
- [ ] Compare app data to Google Sheet
- [ ] All mics from sheet appear in app
- [ ] All data is accurate (no missing/wrong info)
- [ ] Timestamp shows when data was last fetched

## Performance Benchmarks

- [ ] Initial page load: < 3 seconds
- [ ] API response time: < 1 second
- [ ] Skeleton loaders appear immediately (< 100ms)
- [ ] No console errors in browser DevTools
- [ ] No console errors in server logs

## Final Checks

- [ ] All README files are accurate
- [ ] `.env.example` files are complete
- [ ] `.gitignore` files include `.env`
- [ ] No sensitive data committed to git
- [ ] Both repos have initial commits
- [ ] Share app URL with 1-2 friends for feedback

## Success Criteria

This MVP is successful if:

✅ Data is 100% accurate (matches Google Sheet exactly)
✅ Mobile experience is better than using Google Sheets
✅ Loading is fast (< 2 seconds on mobile)
✅ Interface is clean and easy to scan
✅ No errors or broken functionality

---

## If All Boxes Are Checked...

**Congratulations!** You've built the P.U.R.E. MVP.

Now the real test begins: Do people use it?
