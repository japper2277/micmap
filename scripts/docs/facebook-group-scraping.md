# Scraping the NYC Comedy Scene Facebook Group

**Group:** [New York Comedy Scene](https://facebook.com/groups/198219734918102)
**Type:** Private (members only), Visible (anyone can find it)
**Content:** Open mic announcements, comedy show listings, signup links

## The Problem

Facebook killed the Groups API in April 2024. There is no legitimate programmatic access to private group posts.

## Recommended Approaches

### 1. Groups Watcher Chrome Extension (Best Option)

Browser extension that monitors groups you're a member of.

- [Install from Chrome Web Store](https://chromewebstore.google.com/detail/groups-watcher/haclmflikcbameonpfkeomjpfaokombf)
- Tracks keywords: "open mic", "signup", "spots left", "slotted", etc.
- Sends alerts via Slack, Discord, webhooks, or email
- ~3-7 min delay (free), <60s (paid)
- Low ban risk — runs in your browser like a normal user
- Webhook integration with Zapier/Make.com/n8n

**Setup:**
1. Install extension, add the group
2. Set keywords for open mic content
3. Configure webhook to your backend or Slack
4. Process incoming data (reuse Gemini for image posts)

### 2. Facebook Email Notifications + Parser

- Turn on email notifications for the group in FB settings
- Parse emails with Zapier/Make.com
- Free, fully legal, but slower and less structured

### 3. Manual Check + Crowdsource

- Check the group yourself 1-2x/day
- Add a submission form to MicFinder for comedians to submit mic info
- Zero cost, zero risk

### 4. Puppeteer Scraping (Not Recommended)

- Technically works since you're a member
- **High risk of permanent account ban**
- Facebook actively detects automation patterns
- No appeal process if banned
- Violates Facebook TOS

## Cost Comparison

| Approach | Monthly Cost | Setup Effort | Ban Risk | Speed |
|----------|-------------|-------------|----------|-------|
| Groups Watcher (free) | $0 | Low | Low | 3-7 min |
| Groups Watcher (paid) | $10-30 | Low | Low | <60s |
| Email + Parser | $0-20 | Medium | None | Variable |
| Manual | $0 | None | None | Manual |
| Puppeteer | $0 | High | **High** | Real-time |

## Integration with MicMap

The data flow would mirror the IG stories pipeline:

```
Groups Watcher webhook
  → receive post text + image URL
  → if image: send to Gemini for extraction (same as IG pipeline)
  → match against mics.json
  → classify as safe_write or review_required
  → apply or queue for review
```

The Gemini analysis, mic matching, and classification code from `scripts/lib/` can be reused directly.

## Sources

- [Meta deprecates Groups API (Sprinklr)](https://www.sprinklr.com/help/articles/getting-started/meta-deprecates-facebook-groups-api/66229eb25f9dd9599d632712)
- [Meta cuts off third-party access (TechCrunch)](https://techcrunch.com/2024/02/05/meta-cuts-off-third-party-access-to-facebook-groups-leaving-developers-and-customers-in-disarray/)
- [Groups Watcher](https://www.groupswatcher.com/)
