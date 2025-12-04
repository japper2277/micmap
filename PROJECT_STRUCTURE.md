# MicMap Project Structure

```
micmap/
│
├── README.md                    # Main project overview
├── QUICKSTART.md               # 10-minute setup guide
├── PROJECT_STRUCTURE.md        # This file
│
├── api/                        # Backend API (Node.js + Express)
│   ├── server.js              # Main API server with single endpoint
│   ├── package.json           # Node dependencies
│   ├── Procfile               # Heroku deployment config
│   ├── .env.example           # Environment variable template
│   ├── .gitignore            # Git ignore rules
│   └── README.md             # Backend setup & deployment guide
│
└── client/                    # Frontend React app (Vite)
    ├── src/
    │   ├── components/
    │   │   ├── MicList.jsx   # Main component (list display + API fetch)
    │   │   └── MicList.css   # Component styles (mobile-first)
    │   ├── App.jsx           # Root component
    │   ├── App.css           # App-level styles
    │   ├── main.jsx          # React entry point
    │   └── index.css         # Global styles & reset
    │
    ├── index.html            # HTML template
    ├── vite.config.js        # Vite configuration
    ├── vercel.json           # Vercel deployment config
    ├── package.json          # Frontend dependencies
    ├── .env.example          # Environment variable template
    ├── .gitignore           # Git ignore rules
    └── README.md            # Frontend setup & deployment guide
```

## File Count: 20 files

### Backend (8 files)
- 1 server file (server.js)
- 5 configuration files
- 2 documentation files

### Frontend (11 files)
- 5 React components/styles
- 4 configuration files
- 2 documentation files

### Root (3 files)
- 3 documentation files

## Key Technologies

| Layer | Tech | Purpose |
|-------|------|---------|
| **Backend** | Node.js 18 | Runtime |
| | Express | Web framework |
| | Google Sheets API v4 | Data source |
| | Heroku | Hosting |
| **Frontend** | React 18 | UI framework |
| | Vite 5 | Build tool |
| | Vercel | Hosting |
| **Data** | Google Sheets | Single source of truth |

## Data Flow

```
Google Sheet (Community-maintained)
    ↓
Google Sheets API
    ↓
Express API (/api/v1/mics)
    ↓
React App (MicList component)
    ↓
User's Browser
```

## Deployment Flow

```
Local Development:
  api/ → npm run dev → localhost:3001
  client/ → npm run dev → localhost:3000

Production:
  api/ → git push heroku → your-app.herokuapp.com
  client/ → vercel --prod → your-app.vercel.app
```

## Design Decisions

1. **Single Data Source**: Google Sheets only (no web scraping)
2. **Single Endpoint**: One API route, zero complexity
3. **Single Component**: MicList does everything
4. **Zero State Management**: No Redux, Context, or MobX
5. **Mobile-First**: Designed for comedians on the go
6. **No Maps**: Just a list (for now)
7. **No Auth**: Public data, public app

## What Makes This "P.U.R.E."

- **Perfect**: Flawless mobile experience, zero data errors
- **Users**: Built for comedians who need speed
- **Reliable**: 100% accurate data from maintained source
- **Existing**: Leverages community-maintained Google Sheet
