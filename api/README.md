# MicMap API

A simple, reliable API that proxies data from a Google Sheet containing open mic listings.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Get Google Sheets API Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the Google Sheets API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"
4. Create credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the API key

### 3. Make Your Google Sheet Public

Your Google Sheet must be publicly readable:
1. Open your Google Sheet
2. Click "Share" button
3. Change to "Anyone with the link" can view
4. Copy the Sheet ID from the URL

### 4. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
- `GOOGLE_API_KEY`: Your API key from Google Cloud Console
- `SHEET_ID`: The ID from your Google Sheet URL
- `SHEET_RANGE`: (Optional) Specify the range, e.g., "Sheet1!A2:F100"

### 5. Adjust Column Mapping

In `server.js`, update the `header` array to match your Google Sheet columns:

```javascript
const header = ['name', 'address', 'day', 'startTime', 'notes'];
```

## Local Development

```bash
npm run dev
```

The API will be available at `http://localhost:3001`

### Endpoints

- `GET /health` - Health check
- `GET /api/v1/mics` - Fetch all open mics

## Deployment to Heroku

### One-time Setup

1. Install [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
2. Login: `heroku login`
3. Create app: `heroku create your-app-name`

### Set Environment Variables

```bash
heroku config:set GOOGLE_API_KEY="your_api_key"
heroku config:set SHEET_ID="your_sheet_id"
heroku config:set SHEET_RANGE="Sheet1!A2:Z"
```

### Deploy

```bash
git init
git add .
git commit -m "Initial commit"
git push heroku main
```

Your API will be live at `https://your-app-name.herokuapp.com`

## Testing

```bash
# Health check
curl https://your-app-name.herokuapp.com/health

# Get mics
curl https://your-app-name.herokuapp.com/api/v1/mics
```

## Response Format

```json
{
  "success": true,
  "count": 15,
  "lastUpdated": "2024-01-20T10:30:00.000Z",
  "mics": [
    {
      "id": 1,
      "name": "Comedy Cellar Open Mic",
      "address": "117 MacDougal St, New York, NY",
      "day": "Monday",
      "startTime": "7:00 PM",
      "notes": "Sign up at 6:30 PM"
    }
  ]
}
```
