# 📊 Update Google Sheet with Coordinates

Your backend API pulls data from Google Sheets, so you need to add coordinates there!

## ✅ Steps to Update

### 1. Open Your Google Sheet

Find your Google Sheet ID in `api/.env`:
```bash
cat api/.env | grep SHEET_ID
```

Then open: `https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit`

---

### 2. Add Two New Columns

Add these columns **after** your existing columns (probably columns I and J):

| Column Header | Data Type |
|---------------|-----------|
| `lat` (or `latitude`) | Number |
| `lon` (or `longitude`) | Number |

---

### 3. Add Coordinates for These 5 Venues

Find these rows in your sheet and add their coordinates:

#### The Grisly Pear - Midtown
- **lat:** `40.7318243`
- **lon:** `-74.0036027`

#### Second City Mic
- **lat:** `40.7207729`
- **lon:** `-73.9596507`

#### loose lips mic
- **lat:** `40.7180926`
- **lon:** `-73.9502883`

#### Comedy Shop
- **lat:** `40.7288305`
- **lon:** `-74.0001342`

#### Fear City Mic
- **lat:** `40.7152631`
- **lon:** `-73.9901598`

---

### 4. Example Sheet Structure

Your sheet should now look like this:

| Name | Day | Start Time | End Time | Venue Name | Borough | Neighborhood | Address | **lat** | **lon** |
|------|-----|------------|----------|------------|---------|--------------|---------|---------|---------|
| Comedy Shop | Monday | 7:00 PM | ... | Comedy Shop | Manhattan | Greenwich Village | 167 Bleecker St | 40.7288305 | -74.0001342 |
| loose lips mic | Tuesday | 8:00 PM | ... | Pete's | Brooklyn | Williamsburg | 709 Lorimer St | 40.7180926 | -73.9502883 |

---

### 5. Update Your Server (Already Done ✅)

I already updated `api/server.js` to include the `lat` and `lon` columns in line 59!

---

### 6. Restart Your API Server

```bash
cd api
npm start
```

Or if it's already running, restart it:
```bash
# Press Ctrl+C to stop, then:
npm start
```

---

### 7. Test It

Open your browser and visit:
```
http://localhost:3001/api/v1/mics
```

Check that the response includes `lat` and `lon` for each venue!

---

## 🎯 Quick Copy-Paste Coordinates

For easy copy-pasting into your Google Sheet:

```
40.7318243	-74.0036027
40.7207729	-73.9596507
40.7180926	-73.9502883
40.7288305	-74.0001342
40.7152631	-73.9901598
```

(Tab-separated - paste directly into Google Sheets!)

---

## 🔮 Future Venues

When you add new venues to your Google Sheet:

1. Add the street address to `js/venue-addresses.js`
2. Run `geocode-new-venues.html`
3. Copy the coordinates into your Google Sheet
4. Done! 🎤

---

## ⚠️ Important Notes

- Make sure your Google Sheet columns match the order in `server.js` line 59
- Coordinates should be **numbers**, not text
- Don't include quotes around the numbers in Google Sheets
- The API will automatically pick up the new coordinates once you save the sheet

---

✅ Once you update the sheet and restart the API, the warnings will disappear!
