# MicMap - P.U.R.E. MVP

A **P**erfect experience for **U**sers of a **R**eliable, **E**xisting data source.

MicMap is a dead-simple, lightning-fast web app that makes browsing open mic listings from a Google Sheet 10x better than opening Google Sheets on your phone.

## Philosophy

This project embraces radical simplicity:

- **No web scraping** - We use a single, reliable, community-maintained Google Sheet
- **No complex features** - Just a beautiful list, perfectly executed
- **Mobile-first** - Built for comedians on the subway with 5 minutes to spare
- **Trust through reliability** - 100% accurate data, every time

## Architecture

```
micmap/
├── api/          # Node.js + Express API (deployed to Heroku)
└── client/       # React frontend (deployed to Vercel)
```

### Backend (`/api`)
- Single endpoint: `GET /api/v1/mics`
- Fetches data from Google Sheets API
- Transforms rows into clean JSON
- **Stack**: Node.js, Express, Google Sheets API

### Frontend (`/client`)
- Single component: `MicList`
- Mobile-first responsive design
- Skeleton loaders for better UX
- **Stack**: React, Vite

## Quick Start

### 1. Setup Backend

```bash
cd api
npm install
cp .env.example .env
# Edit .env with your Google API credentials
npm run dev
```

See [`api/README.md`](api/README.md) for detailed setup instructions.

### 2. Setup Frontend

```bash
cd client
npm install
cp .env.example .env
# Edit .env with your API URL
npm run dev
```

See [`client/README.md`](client/README.md) for detailed setup instructions.

## Deployment

### Backend to Heroku

```bash
cd api
heroku create your-app-name
heroku config:set GOOGLE_API_KEY="your_key"
heroku config:set SHEET_ID="your_sheet_id"
git init
git add .
git commit -m "Initial commit"
git push heroku main
```

### Frontend to Vercel

```bash
cd client
vercel
vercel env add VITE_API_URL
# Enter your Heroku URL
vercel --prod
```

## The MVP Success Criteria

This MVP is successful if:

1. ✅ The data is 100% accurate (no broken scraper bugs)
2. ✅ The mobile experience is better than opening Google Sheets
3. ✅ Loading is fast (< 2 seconds)
4. ✅ The interface is clean and scannable

## What This MVP Proves

- **Product validation**: Do people want a better way to find mics?
- **Design hypothesis**: Can we make a single data source delightful?
- **Technical foundation**: Can we build something reliable before scaling?

## What This MVP Doesn't Do (Yet)

- No maps
- No favorites
- No filters
- No user accounts
- No multiple data sources
- No web scraping

**And that's the point.** We achieve perfection at infinitesimal scale first.

## Next Steps (Only If MVP Succeeds)

1. **V1.5**: Add "Submit a mic" form (community contribution)
2. **V2**: Add ONE additional curated source
3. **V3**: User-generated content (the "Waze" moment)

But all of that is contingent on proving this tiny thing works first.

## Tech Stack

- **Backend**: Node.js 18, Express, Google Sheets API v4
- **Frontend**: React 18, Vite 5
- **Deployment**: Heroku (API) + Vercel (Client)
- **Data Source**: Google Sheets (single, reliable source)

## Contributing

Not accepting contributions yet. This is an MVP to validate core assumptions.

## License

MIT
