# MicMap Client

A beautiful, mobile-first React app for browsing open mic listings.

## Features

- Lightning-fast performance with Vite
- Mobile-first responsive design
- Skeleton loading states for better UX
- Clean, scannable interface optimized for comedians on the go
- Real-time data from Google Sheets

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set your API URL:
- **Local development**: `VITE_API_URL=http://localhost:3001`
- **Production**: `VITE_API_URL=https://your-api-on-heroku.herokuapp.com`

### 3. Run Locally

```bash
npm run dev
```

App will be available at `http://localhost:3000`

## Deployment to Vercel

### Quick Deploy (Recommended)

1. Install [Vercel CLI](https://vercel.com/download): `npm i -g vercel`
2. Login: `vercel login`
3. Deploy: `vercel`

### Set Environment Variable

After deployment, set your production API URL:

```bash
vercel env add VITE_API_URL
```

Enter your Heroku API URL when prompted (e.g., `https://your-app-name.herokuapp.com`)

### Redeploy with Environment Variable

```bash
vercel --prod
```

### Alternative: GitHub Integration

1. Push your code to GitHub
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "New Project"
4. Import your GitHub repository
5. Add environment variable:
   - Name: `VITE_API_URL`
   - Value: Your Heroku API URL
6. Click "Deploy"

## Project Structure

```
client/
├── src/
│   ├── components/
│   │   ├── MicList.jsx          # Main component
│   │   └── MicList.css          # Component styles
│   ├── App.jsx                  # Root component
│   ├── App.css                  # App styles
│   ├── main.jsx                 # Entry point
│   └── index.css                # Global styles
├── index.html                   # HTML template
├── vite.config.js               # Vite configuration
└── package.json
```

## Build for Production

```bash
npm run build
```

Output will be in the `dist/` directory.

## Preview Production Build

```bash
npm run preview
```

## Design Principles

This app follows the **P.U.R.E.** model:
- **Perfect** user experience
- **Users** are comedians who need speed
- **Reliable** data from a trusted source
- **Existing** infrastructure (Google Sheets)

The design is optimized for:
- Quick scanning on mobile devices
- Minimal cognitive load
- Fast loading and rendering
- Accessibility and readability
