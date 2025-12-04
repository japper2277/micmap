import csv
import json

# Read the geocoded CSV
input_file = '/Users/jaredapper/Desktop/micmap/venues-with-coordinates.csv'
output_file = '/Users/jaredapper/Desktop/micmap/js/data.js'

mics = []
mic_id = 1

with open(input_file, 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        # Skip empty rows
        if not row['name'] or not row['venueName']:
            continue

        # Parse coordinates
        lat = float(row['lat']) if row['lat'] else None
        lon = float(row['lon']) if row['lon'] else None

        if lat is None or lon is None:
            print(f"⚠️ Skipping {row['name']} - no coordinates")
            continue

        # Create mic object
        mic = {
            'id': mic_id,
            'name': row['name'],
            'day': row['day'],
            'startTime': row['startTime'],
            'endTime': row.get('endTime', ''),
            'borough': row['borough'],
            'neighborhood': row['neighborhood'],
            'venueName': row['venueName'],
            'address': row['address'],
            'lat': lat,
            'lon': lon
        }

        mics.append(mic)
        mic_id += 1

# Generate JavaScript file
js_content = '''// =============================================================================
// MIC DATA - AUTO-GENERATED FROM CSV
// =============================================================================

let mockMics = [
'''

for i, mic in enumerate(mics):
    js_content += f'''    {{
        id: {mic['id']},
        name: "{mic['name']}",
        day: "{mic['day']}",
        startTime: "{mic['startTime']}",
        {f'endTime: "{mic["endTime"]}",' if mic['endTime'] else ''}

        // Location
        venueName: "{mic['venueName']}",
        borough: "{mic['borough']}",
        neighborhood: "{mic['neighborhood']}",
        address: "{mic['address']}",
        lat: {mic['lat']},
        lon: {mic['lon']},

        // Sign-up Info
        signUpDetails: {{
            type: 'in-person',
            value: 'Check venue for details.'
        }},

        // Details
        cost: "TBD",
        host: "TBD",
        stageTime: null,
        comics: 0,
        tags: [],
        environment: "Public Venue",
        lastUpdated: "2024-10-20"
    }}{"," if i < len(mics) - 1 else ""}

'''

js_content += '];\n'

# Write output
with open(output_file, 'w') as f:
    f.write(js_content)

print(f"✅ Converted {len(mics)} mics to JavaScript")
print(f"📁 Output: {output_file}")
