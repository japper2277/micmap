import csv
import requests
import time

def geocode_venue(venue_name, address):
    """Geocode a venue using Nominatim API"""
    query = f"{venue_name}, {address}"
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        'q': query,
        'format': 'json',
        'limit': 1
    }
    headers = {
        'User-Agent': 'MicMapApp/1.0'
    }

    try:
        response = requests.get(url, params=params, headers=headers)
        response.raise_for_status()
        results = response.json()

        if results:
            return float(results[0]['lat']), float(results[0]['lon'])
        return None, None
    except Exception as e:
        print(f"Error geocoding {venue_name}: {e}")
        return None, None

# Read input CSV
input_file = '/Users/jaredapper/Desktop/micmap/merged-mics.csv'
output_file = '/Users/jaredapper/Desktop/micmap/mics-geocoded.csv'

venues_geocoded = {}
all_records = []

with open(input_file, 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        all_records.append(row)

# Get unique venues
unique_venues = {}
for record in all_records:
    venue = record['venue']
    address = record['address']
    if venue not in unique_venues:
        unique_venues[venue] = address

print(f"📊 Found {len(unique_venues)} unique venues to geocode")

# Geocode each unique venue
for i, (venue, address) in enumerate(unique_venues.items(), 1):
    print(f"[{i}/{len(unique_venues)}] Geocoding {venue}...")
    lat, lon = geocode_venue(venue, address)
    venues_geocoded[venue] = (lat, lon)
    time.sleep(1)  # Rate limiting

# Write output
with_coords = 0
without_coords = 0

with open(output_file, 'w', newline='') as f:
    fieldnames = ['venue', 'address', 'day', 'time', 'show', 'latitude', 'longitude']
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()

    for record in all_records:
        venue = record['venue']
        lat, lon = venues_geocoded.get(venue, (None, None))

        output_row = {
            'venue': record['venue'],
            'address': record['address'],
            'day': record['day'],
            'time': record['time'],
            'show': record['show'],
            'latitude': lat if lat else '',
            'longitude': lon if lon else ''
        }
        writer.writerow(output_row)

        if lat and lon:
            with_coords += 1
        else:
            without_coords += 1

print(f"\n✅ Done! Wrote {len(all_records)} records to {output_file}")
print(f"📊 {len(unique_venues)} venues geocoded")
print(f"\n📈 Results:")
print(f"  ✅ With coordinates: {with_coords}")
print(f"  ❌ Without coordinates: {without_coords}")
