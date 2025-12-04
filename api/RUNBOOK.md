# MicMap API - Operations Runbook

## Quick Reference

**Production URL**: https://micmap-api.herokuapp.com
**Health Check**: https://micmap-api.herokuapp.com/health/deep
**On-Call**: [Your contact info]

---

## Service Level Definitions

### Healthy
- MongoDB response time < 100ms
- Redis connected (optional - graceful degradation if down)
- API returns 200 status codes
- `/health/deep` returns `{"status": "healthy"}`

### Degraded
- MongoDB response time 100-500ms, OR
- Redis disconnected/unavailable
- API still functional but slower
- `/health/deep` returns `{"status": "degraded"}` with 207 status code

### Unhealthy
- MongoDB down or response time > 500ms
- API returns 503 errors
- `/health/deep` returns `{"status": "unhealthy"}` with 503 status code

---

## Incident Response Procedures

### 1. API is Down (503 Errors)

**Symptoms:**
- Users report "API unavailable"
- `/health` returns 503
- Monitoring alerts firing

**Diagnosis:**
```bash
# Check Heroku app status
heroku status

# Check application logs
heroku logs --tail --app micmap-api

# Check dyno status
heroku ps --app micmap-api

# Test health endpoint
curl https://micmap-api.herokuapp.com/health/deep
```

**Common Causes & Fixes:**

**A. MongoDB Connection Failure**
```bash
# Check MongoDB Atlas status
# Visit: https://cloud.mongodb.com/

# Verify connection string is correct
heroku config:get MONGODB_URI --app micmap-api

# Check MongoDB Atlas IP whitelist
# Add 0.0.0.0/0 if needed (allows all IPs)

# Restart dyno to force reconnection
heroku restart --app micmap-api
```

**B. Application Crash**
```bash
# Check recent deploys
heroku releases --app micmap-api

# Rollback to previous version
heroku rollback --app micmap-api

# Or rollback to specific version
heroku rollback v123 --app micmap-api
```

**C. Out of Memory**
```bash
# Check dyno metrics
heroku ps:type --app micmap-api

# Upgrade dyno if needed
heroku ps:scale web=1:standard-1x --app micmap-api
```

---

### 2. Slow Response Times (> 500ms)

**Symptoms:**
- API responds but slowly
- `/health/deep` shows "degraded"
- MongoDB responseTime > 100ms

**Diagnosis:**
```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s https://micmap-api.herokuapp.com/api/v1/mics

# Check MongoDB Atlas performance
# Visit MongoDB Atlas → Metrics

# Check Redis status
heroku redis:info --app micmap-api
```

**Fixes:**

**A. MongoDB Performance**
```bash
# Check if indexes are working
# Run this in MongoDB Atlas Data Explorer:
# db.mics.find({day: "Monday"}).explain("executionStats")

# If indexes missing, run locally:
npm run seed  # This creates indexes
```

**B. Clear Redis Cache**
```bash
# If cache is corrupted/stale
heroku redis:cli --app micmap-api
> FLUSHALL
> exit
```

**C. Scale Up**
```bash
# Add more dynos
heroku ps:scale web=2 --app micmap-api

# Upgrade dyno tier
heroku ps:type web=standard-1x --app micmap-api
```

---

### 3. Data Loss / Database Corrupted

**Symptoms:**
- `/api/v1/mics` returns 0 mics
- Data missing or incorrect

**IMMEDIATE ACTION:**
```bash
# 1. STOP ALL WRITE OPERATIONS
heroku maintenance:on --app micmap-api

# 2. Check MongoDB Atlas backups
# Visit: MongoDB Atlas → Backups
# Latest backup should be < 24 hours old

# 3. Restore from backup
# MongoDB Atlas → Clusters → Restore
# Choose point-in-time or snapshot

# 4. Verify restoration
curl https://micmap-api.herokuapp.com/api/v1/mics | jq '.count'

# 5. Resume service
heroku maintenance:off --app micmap-api
```

**Prevention:**
- MongoDB Atlas M0 tier has daily backups
- Consider upgrading to M10 for continuous backups (every 6 hours)

---

### 4. High Error Rate (> 1%)

**Symptoms:**
- Monitoring shows spike in 500 errors
- Users report intermittent failures

**Diagnosis:**
```bash
# Check error logs
heroku logs --tail --app micmap-api | grep "❌"

# Check specific error
heroku logs --tail --app micmap-api | grep "Error"

# Get error rate
heroku logs --app micmap-api | grep "statusCode" | awk '{print $NF}' | sort | uniq -c
```

**Common Errors:**

**A. "MongoDB connection failed"**
- See "API is Down" → MongoDB Connection Failure

**B. "Failed to fetch open mic data"**
```bash
# Check if MongoDB has data
# In MongoDB Atlas:
db.mics.countDocuments()  # Should be > 0

# If 0, re-seed database
npm run seed
```

**C. "Cache middleware error"**
```bash
# Restart Redis
heroku redis:restart --app micmap-api

# Or provision new Redis
heroku addons:destroy heroku-redis --app micmap-api --confirm micmap-api
heroku addons:create heroku-redis:mini --app micmap-api
```

---

### 5. Deployment Failed

**Symptoms:**
- `git push heroku main` fails
- Build succeeds but app won't start

**Rollback Immediately:**
```bash
heroku rollback --app micmap-api
```

**Diagnosis:**
```bash
# Check build logs
heroku logs --tail --app micmap-api --source heroku

# Common issues:
# 1. Missing environment variables
heroku config --app micmap-api

# 2. Failed npm install
# Check package.json dependencies

# 3. Port binding
# Make sure server.js uses process.env.PORT
```

**Fix and Redeploy:**
```bash
# 1. Fix issue locally
# 2. Test locally
npm start

# 3. Run pre-deploy checks
npm run pre-deploy

# 4. Deploy
git push heroku main

# 5. Verify
npm run smoke-test:production
```

---

## Monitoring & Alerts

### Health Check Monitoring

**Set up UptimeRobot (free):**
1. Go to https://uptimerobot.com
2. Add Monitor:
   - Type: HTTP(S)
   - URL: https://micmap-api.herokuapp.com/health
   - Interval: 5 minutes
3. Add alert contacts (email/SMS)

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-03T...",
  "uptime": 3600
}
```

### Error Tracking

**Sentry (optional - when implemented):**
```bash
# Install Sentry addon
heroku addons:create sentry:f1 --app micmap-api

# View errors
heroku addons:open sentry --app micmap-api
```

---

## Maintenance Windows

### Planned Maintenance

**Before maintenance:**
```bash
# 1. Announce maintenance
heroku maintenance:on --app micmap-api

# 2. Current status page will show:
"Application Unavailable - Scheduled Maintenance"
```

**During maintenance:**
```bash
# Perform updates
# Run database migrations
# Update environment variables
```

**After maintenance:**
```bash
# 1. Run smoke tests
npm run smoke-test:production

# 2. If tests pass, resume service
heroku maintenance:off --app micmap-api

# 3. Monitor for 30 minutes
heroku logs --tail --app micmap-api
```

---

## Common Operational Tasks

### Update Environment Variables

```bash
# View current config
heroku config --app micmap-api

# Set new variable
heroku config:set SHEET_ID=new_sheet_id --app micmap-api

# Unset variable
heroku config:unset OLD_VAR --app micmap-api

# Note: Setting config automatically restarts app
```

### Scale Dynos

```bash
# Scale up (more concurrent requests)
heroku ps:scale web=2 --app micmap-api

# Scale down
heroku ps:scale web=1 --app micmap-api

# Upgrade tier (more memory/CPU)
heroku ps:type web=standard-1x --app micmap-api
```

### View Logs

```bash
# Tail logs (live)
heroku logs --tail --app micmap-api

# Filter by source
heroku logs --source app --app micmap-api

# Last 1000 lines
heroku logs -n 1000 --app micmap-api

# Search for errors
heroku logs --app micmap-api | grep "Error"
```

### Database Operations

```bash
# Seed database with initial data
npm run seed

# Check database size
# In MongoDB Atlas: Metrics → Storage Size

# Create manual backup
# MongoDB Atlas → Clusters → ... → Create Snapshot
```

---

## Performance Baselines

### Response Times (p95)
- `/health`: < 50ms
- `/health/deep`: < 100ms
- `/api/v1/mics` (uncached): < 200ms
- `/api/v1/mics` (cached): < 20ms

### Throughput
- Eco dyno: ~50 req/sec
- Standard-1X: ~200 req/sec

### Error Rates
- Normal: < 0.1%
- Alert if: > 1%
- Critical if: > 5%

---

## Contact Information

**Primary On-Call**: [Your Name]
**Email**: [your-email@example.com]
**Phone**: [your-phone]

**Escalation**:
1. Check this runbook first
2. If unresolved after 15 min, escalate to [Tech Lead]
3. If P1 incident, page [Engineering Manager]

**External Services:**
- Heroku Status: https://status.heroku.com
- MongoDB Atlas Support: https://cloud.mongodb.com
- Heroku Support: https://help.heroku.com

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-11-03 | Initial runbook created | Claude |
