# MicMap Deployment Summary

## 🎉 Your App is Live!

**Frontend URL:** https://bright-muffin-b74979.netlify.app
**Backend API URL:** https://micmap-production.up.railway.app

---

## Architecture Overview

### Backend (Railway)
- **Service:** micmap-production.up.railway.app
- **Deployed from:** `/api` folder
- **Technology:** Node.js, Express
- **Port:** Dynamic (provided by Railway)
- **Features:**
  - MTA real-time subway data
  - Subway routing with wait times
  - Transit directions
  - Venue API
  - Redis caching

### Frontend (Netlify)
- **Service:** bright-muffin-b74979.netlify.app
- **Deployed from:** `/map_designs/newest_map` folder
- **Technology:** HTML, CSS, JavaScript (Vanilla)
- **Features:**
  - Interactive map with 298 venues
  - Search functionality
  - Filters by day/time
  - Transit directions
  - Responsive design

### Databases

**MongoDB Atlas (Free Tier)**
- **Cluster:** micmap
- **Database:** micmap
- **Username:** japper2277
- **Connection:** `mongodb+srv://japper2277:PASSWORD@micmap.lrqgcyk.mongodb.net/micmap`
- **Data:** 298 comedy open mic venues

**Redis Cloud (Free Tier)**
- **Endpoint:** redis-14142.c270.us-east-1-3.ec2.cloud.redislabs.com:14142
- **Connection:** `redis://default:PASSWORD@redis-14142.c270.us-east-1-3.ec2.cloud.redislabs.com:14142`
- **Purpose:** API response caching, MTA data caching

---

## Environment Variables (Railway)

```
MONGODB_URI=mongodb+srv://japper2277:PASSWORD@micmap.lrqgcyk.mongodb.net/micmap?retryWrites=true&w=majority
REDIS_URL=redis://default:PASSWORD@redis-14142.c270.us-east-1-3.ec2.cloud.redislabs.com:14142
NODE_ENV=production
GOOGLE_API_KEY=your_key (if needed)
SHEET_ID=your_sheet_id (if needed)
```

**Note:** PORT is NOT set - Railway provides it dynamically

---

## Local Development

### Running Locally

**Terminal 1 - Backend:**
```bash
cd ~/Desktop/micmap/api
npm install
npm run dev
```
Backend runs on: http://localhost:3001

**Terminal 2 - Frontend:**
```bash
cd ~/Desktop/micmap/map_designs
python3 -m http.server 8080
```
Frontend runs on: http://localhost:8080/newest_map/

### How It Works

The frontend automatically detects the environment:
- **Local:** Uses `http://localhost:3001` for API
- **Production:** Uses `https://micmap-production.up.railway.app` for API

No code changes needed when switching between environments!

---

## Deployment Workflow

### Updating the App

**1. Make changes locally:**
```bash
# Edit files in /api or /map_designs/newest_map
```

**2. Test locally:**
```bash
# Start both backend and frontend locally
# Test your changes at http://localhost:8080/newest_map/
```

**3. Commit and push:**
```bash
git add .
git commit -m "Your commit message"
git push
```

**4. Automatic deployment:**
- **Railway:** Auto-deploys backend when you push to main branch
- **Netlify:** You need to manually redeploy (drag/drop folder or use CLI)

### Redeploying Frontend to Netlify

**Option 1 - Drag & Drop:**
1. Go to https://app.netlify.com
2. Find your site (bright-muffin-b74979)
3. Click "Deploys" → "Drag and drop"
4. Drag `/map_designs/newest_map` folder

**Option 2 - CLI:**
```bash
cd ~/Desktop/micmap/map_designs/newest_map
netlify deploy --prod
```

---

## Database Management

### Seeding Production Database

If you need to update the database with new venues:

```bash
cd ~/Desktop/micmap/api
MONGODB_URI="your_full_mongodb_uri" npm run seed
```

This will:
1. Connect to production MongoDB
2. Clear existing mics
3. Import data from `api/mics.json`

### Updating Venue Data

1. Edit `api/mics.json` with new venue data
2. Run the seed command above
3. Data is live immediately (cached for 5 minutes)

---

## Important File Paths

### Backend Files (Railway deploys from /api)
```
/api/server.js              - Main server file
/api/scripts/               - Subway router, seed scripts
/api/public/data/           - GTFS data, station data
/api/models/Mic.js          - MongoDB schema
/api/middleware/            - Cache, logging
```

### Frontend Files (Netlify deploys from /map_designs/newest_map)
```
/map_designs/newest_map/index.html     - Main HTML
/map_designs/newest_map/js/config.js   - API configuration
/map_designs/newest_map/js/app.js      - Main app logic
/map_designs/newest_map/css/           - Stylesheets
```

---

## API Endpoints

### Health Check
```
GET https://micmap-production.up.railway.app/health
```
Returns: `{"status":"healthy","timestamp":"...","uptime":...}`

### Get All Mics
```
GET https://micmap-production.up.railway.app/api/v1/mics
```
Returns: Array of all open mic venues

### Get MTA Alerts
```
GET https://micmap-production.up.railway.app/api/mta/alerts
```
Returns: Current MTA service alerts

### Get MTA Arrivals
```
GET https://micmap-production.up.railway.app/api/mta/arrivals/:line/:stopId
```
Returns: Real-time train arrival times

### Static Data
```
GET https://micmap-production.up.railway.app/data/stations.json
GET https://micmap-production.up.railway.app/data/graph.json
```
Returns: Subway station and routing data

---

## Troubleshooting

### Backend Issues

**API not responding:**
1. Check Railway logs: https://railway.com/project/bc973998-8719-4101-a86c-f50f4457bc98
2. Verify environment variables are set
3. Check MongoDB and Redis are connected

**502 Bad Gateway:**
- Make sure PORT variable is NOT set in Railway
- Railway provides PORT dynamically

**MongoDB connection failed:**
1. Reset password in MongoDB Atlas
2. Update MONGODB_URI in Railway Variables
3. Railway will auto-redeploy

### Frontend Issues

**No venues showing:**
1. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+F5 (Windows)
2. Check browser console for errors (F12)
3. Verify API is working: https://micmap-production.up.railway.app/api/v1/mics

**404 errors for data files:**
1. Check Railway deployment logs
2. Verify NODE_ENV=production in Railway
3. Check that files exist in api/public/data/

**Map not loading:**
1. Check browser console for errors
2. Verify config.js has correct API URL
3. Clear browser cache

### Database Issues

**Empty database:**
```bash
cd ~/Desktop/micmap/api
MONGODB_URI="your_uri" npm run seed
```

**Authentication failed:**
1. Go to MongoDB Atlas
2. Database Access → Edit user → Reset password
3. Update Railway MONGODB_URI variable

---

## Costs

**Current Setup (All FREE!):**
- Railway: Free tier (500 hours/month)
- Netlify: Free tier (100GB bandwidth/month)
- MongoDB Atlas: Free tier (512MB storage)
- Redis Cloud: Free tier (30MB RAM)

**Total Cost:** $0/month

**If you outgrow free tiers:**
- Railway: $5/month
- Netlify: $19/month (Pro)
- MongoDB Atlas: $9/month (M10)
- Redis Cloud: $5/month (1GB)

---

## Next Steps (Optional)

### Configure Custom Domain (micmap.com)

**If you own the domain:**
1. In Netlify: Domain settings → Add custom domain → micmap.com
2. In your domain registrar (GoDaddy, Namecheap, etc.):
   - Add A record: `@` → `75.2.60.5`
   - Add CNAME record: `www` → `bright-muffin-b74979.netlify.app`
3. Wait for DNS propagation (5-30 minutes)
4. Netlify will auto-provision SSL certificate

**If you don't own it yet:**
- Buy at Namecheap (~$12/year) or Google Domains
- Then follow steps above

### Add Features

**Subway router is included!**
- Real-time MTA data
- Wait time calculations
- Multi-route options
- Transfer handling

**To add:**
- User accounts
- Favorite venues
- Event calendar
- Reviews/ratings
- Mobile app (PWA)

---

## Useful Commands

### Local Development
```bash
# Start backend
cd ~/Desktop/micmap/api && npm run dev

# Start frontend
cd ~/Desktop/micmap/map_designs && python3 -m http.server 8080

# Run tests
cd ~/Desktop/micmap/api && npm test

# Seed local database
cd ~/Desktop/micmap/api && npm run seed
```

### Deployment
```bash
# Commit changes
git add .
git commit -m "Your message"
git push

# Deploy frontend to Netlify
cd ~/Desktop/micmap/map_designs/newest_map
netlify deploy --prod

# Seed production database
MONGODB_URI="uri" npm run seed
```

### Monitoring
```bash
# Railway logs
https://railway.com/project/bc973998-8719-4101-a86c-f50f4457bc98

# Netlify logs
https://app.netlify.com (your site → Deploys → View logs)

# MongoDB metrics
https://cloud.mongodb.com (Clusters → MicMap → Metrics)
```

---

## Support

**Railway:** https://railway.app/help
**Netlify:** https://www.netlify.com/support
**MongoDB Atlas:** https://www.mongodb.com/docs/atlas
**Redis Cloud:** https://redis.io/docs

---

## Summary

✅ **Backend API:** Running on Railway with MongoDB + Redis
✅ **Frontend:** Deployed on Netlify
✅ **Database:** 298 venues loaded
✅ **Transit features:** Full subway routing with real-time data
✅ **Cost:** $0/month (all free tiers)
✅ **Performance:** Cached responses, fast load times

**Your app is live and ready to use!** 🎉

Share this URL: https://bright-muffin-b74979.netlify.app
