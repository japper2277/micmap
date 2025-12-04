# MicMap API - Deployment Guide

## Prerequisites

Before deploying, ensure you have:

- [x] Heroku CLI installed (`brew install heroku`)
- [x] Git repository initialized
- [x] MongoDB Atlas account (free M0 tier or paid)
- [x] Google Sheets API key
- [x] All tests passing (`npm test`)

---

## Initial Deployment to Heroku

### Step 1: Create Heroku App

```bash
# Login to Heroku
heroku login

# Create new app (choose unique name)
heroku create micmap-api

# Or use auto-generated name
heroku create

# Verify app was created
heroku apps:info
```

### Step 2: Add Redis Addon

```bash
# Add Redis (mini plan: $3/month)
heroku addons:create heroku-redis:mini --app micmap-api

# Verify Redis was added
heroku addons --app micmap-api

# Check Redis URL (auto-set)
heroku config:get REDIS_URL --app micmap-api
```

### Step 3: Set Environment Variables

```bash
# Set MongoDB connection string
heroku config:set MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/micmap?retryWrites=true&w=majority" --app micmap-api

# Set Google Sheets API credentials
heroku config:set GOOGLE_API_KEY="your_google_api_key_here" --app micmap-api
heroku config:set SHEET_ID="your_google_sheet_id" --app micmap-api

# Optional: Set sheet range
heroku config:set SHEET_RANGE="Sheet1!A2:Z" --app micmap-api

# Set Node environment
heroku config:set NODE_ENV="production" --app micmap-api

# Verify all config vars
heroku config --app micmap-api
```

### Step 4: Pre-Deployment Checks

```bash
# Verify environment variables locally
npm run verify-env

# Run all tests
npm test

# Or run pre-deploy script (does both)
npm run pre-deploy
```

### Step 5: Deploy

```bash
# Add Heroku remote (if not done automatically)
heroku git:remote -a micmap-api

# Deploy to Heroku
git push heroku main

# Watch deployment logs
heroku logs --tail --app micmap-api
```

### Step 6: Seed Database

```bash
# Run locally (connects to production MongoDB Atlas)
npm run seed

# Verify data was inserted
curl https://micmap-api.herokuapp.com/api/v1/mics | jq '.count'
```

### Step 7: Post-Deployment Verification

```bash
# Run smoke tests
npm run smoke-test:production

# Check health endpoint
curl https://micmap-api.herokuapp.com/health/deep | jq

# Test API
curl https://micmap-api.herokuapp.com/api/v1/mics?day=Monday | jq
```

---

## MongoDB Atlas Setup

### Create Cluster

1. Go to https://cloud.mongodb.com
2. Sign up / Log in
3. Create new cluster:
   - **Free Tier (M0)**: Good for development/testing
     - 512MB storage
     - 100 max connections
     - Limited to 1 cluster
   - **Paid (M10)**: Recommended for production
     - 2GB RAM
     - Better performance
     - Continuous backups

### Configure Network Access

```bash
# Allow access from anywhere (for Heroku)
# MongoDB Atlas → Network Access → Add IP Address
# IP: 0.0.0.0/0
# Comment: "Heroku dynos"
```

### Create Database User

```bash
# MongoDB Atlas → Database Access → Add New Database User
# Username: micmap-api
# Password: [generate strong password]
# Role: Read and write to any database
```

### Get Connection String

```bash
# MongoDB Atlas → Clusters → Connect → Connect your application
# Copy connection string:
mongodb+srv://micmap-api:<password>@cluster.mongodb.net/micmap?retryWrites=true&w=majority

# Replace <password> with actual password
# Set as MONGODB_URI in Heroku
```

---

## Deployment Checklist

Use this checklist before every deployment:

### Pre-Deployment

- [ ] All tests pass locally (`npm test`)
- [ ] Environment variables verified (`npm run verify-env`)
- [ ] Changes committed to git
- [ ] Version bumped in package.json (optional)
- [ ] CHANGELOG updated (if applicable)

### Deployment

- [ ] Deploy to Heroku (`git push heroku main`)
- [ ] Deployment succeeded (check logs)
- [ ] App started successfully (no crashes)

### Post-Deployment

- [ ] Health check passes (`npm run smoke-test:production`)
- [ ] API returns data (`curl .../api/v1/mics`)
- [ ] Filtering works (`curl .../api/v1/mics?day=Monday`)
- [ ] No errors in logs (`heroku logs --tail`)
- [ ] Monitor for 15 minutes

### Rollback (if needed)

```bash
# If deployment breaks:
heroku rollback --app micmap-api

# Verify rollback
npm run smoke-test:production
```

---

## Updating the Application

### Code Changes

```bash
# 1. Make changes locally
# 2. Test changes
npm test

# 3. Commit changes
git add .
git commit -m "Your commit message"

# 4. Deploy
git push heroku main

# 5. Verify
npm run smoke-test:production
```

### Environment Variable Changes

```bash
# Update variable
heroku config:set NEW_VAR=value --app micmap-api

# Note: This automatically restarts the app
# Monitor logs after restart
heroku logs --tail --app micmap-api
```

### Database Schema Changes

```bash
# 1. Test migration locally first
# 2. Create migration script in scripts/migrations/
# 3. Run migration
node scripts/migrations/2025-11-04-add-new-field.js

# 4. Verify migration
# Check MongoDB Atlas Data Explorer
```

---

## Scaling

### Horizontal Scaling (More Dynos)

```bash
# Scale to 2 dynos
heroku ps:scale web=2 --app micmap-api

# Scale back to 1
heroku ps:scale web=1 --app micmap-api

# Note: Eco dynos cost $5/month
# Standard dynos cost $25/month per dyno
```

### Vertical Scaling (Bigger Dynos)

```bash
# Upgrade to Standard-1X (512MB RAM)
heroku ps:type web=standard-1x --app micmap-api

# Upgrade to Standard-2X (1GB RAM)
heroku ps:type web=standard-2x --app micmap-api

# Cost: Standard-1X = $25/month, Standard-2X = $50/month
```

### When to Scale

**Scale horizontally (add dynos) when:**
- Request rate > 50 req/sec on eco dyno
- Need high availability (no downtime)

**Scale vertically (upgrade dyno) when:**
- Memory usage > 80% (check `heroku metrics`)
- CPU usage > 80% consistently
- Response times degrading

---

## Monitoring Setup

### UptimeRobot (Free)

```bash
# 1. Go to https://uptimerobot.com
# 2. Create account
# 3. Add HTTP(S) monitor:
#    - Name: MicMap API
#    - URL: https://micmap-api.herokuapp.com/health
#    - Interval: 5 minutes
# 4. Add alert contacts (email/SMS)
```

### Heroku Metrics (Built-in)

```bash
# View metrics dashboard
heroku metrics --app micmap-api

# Or view in browser
heroku dashboard --app micmap-api
```

### Sentry (Error Tracking - Optional)

```bash
# Install Sentry addon (free tier available)
heroku addons:create sentry:f1 --app micmap-api

# Configure in code (see Sentry docs)
# Add SENTRY_DSN to environment variables
```

---

## Troubleshooting

### Deployment Fails

**Error: "Failed to compile"**
```bash
# Check Node version in package.json matches Heroku
# Currently set to: "node": "18.x"

# Update if needed
# Edit package.json: "engines": { "node": "20.x" }
```

**Error: "Missing dependencies"**
```bash
# Make sure dependencies are in package.json, not devDependencies
npm install --save [package-name]
```

### App Crashes After Deploy

```bash
# Check logs
heroku logs --tail --app micmap-api

# Common issues:
# 1. MONGODB_URI not set
heroku config:get MONGODB_URI

# 2. Port binding issue
# Make sure server.js uses: process.env.PORT || 3001

# 3. Missing environment variable
heroku config --app micmap-api
```

### Database Connection Fails

```bash
# 1. Verify MongoDB Atlas is running
# Visit: https://cloud.mongodb.com

# 2. Check IP whitelist includes 0.0.0.0/0

# 3. Test connection string locally
MONGODB_URI="your_uri" npm start

# 4. Check MongoDB Atlas metrics for connection errors
```

---

## Cost Estimation

### Minimum Setup (Development)
- Heroku Eco Dyno: $5/month
- Heroku Redis Mini: $3/month
- MongoDB Atlas M0: Free
- **Total: $8/month**

### Recommended Setup (Production)
- Heroku Standard-1X (×2): $50/month
- Heroku Redis Premium-0: $15/month
- MongoDB Atlas M10: $57/month
- **Total: $122/month**

### Cost Optimization Tips
1. Use Eco dyno for development/testing
2. Scale up only when needed
3. Monitor usage with Heroku metrics
4. Consider MongoDB Atlas M2 ($9/month) before M10

---

## Rollback Procedure

### Immediate Rollback

```bash
# Rollback to previous release
heroku rollback --app micmap-api

# Rollback to specific release
heroku releases --app micmap-api  # List releases
heroku rollback v123 --app micmap-api
```

### Verify Rollback

```bash
# Check current release
heroku releases --app micmap-api | head -5

# Run smoke tests
npm run smoke-test:production

# Monitor logs
heroku logs --tail --app micmap-api
```

---

## CI/CD Integration (Future)

### GitHub Actions (Recommended)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Heroku

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: akhileshns/heroku-deploy@v3.12.12
        with:
          heroku_api_key: ${{secrets.HEROKU_API_KEY}}
          heroku_app_name: "micmap-api"
          heroku_email: "your-email@example.com"
```

---

## Support

For deployment issues:
- Check RUNBOOK.md for incident response
- Heroku Support: https://help.heroku.com
- MongoDB Atlas Support: https://cloud.mongodb.com/support

---

**Last Updated**: 2025-11-03
**Version**: 1.0.0
