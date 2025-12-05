#!/usr/bin/env python3
"""Convert mics-geocoded.csv to mics.json"""

import csv
import json

def clean_cost(cost):
    """Abbreviate cost strings"""
    if not cost:
        return 'Free'
    cost = cost.strip()
    # Abbreviations
    cost = cost.replace('Free (purchase recommended)', 'Plz Buy smth')
    cost = cost.replace('(includes drink)', '(w/ drink)')
    cost = cost.replace('(includes drink/fries)', '(w/ drink)')
    cost = cost.replace('Drink Minimum', 'drink min')
    cost = cost.replace('Item Minimum', 'item min')
    cost = cost.replace('cash', '')
    cost = cost.replace('online', '')
    cost = cost.strip()
    return cost or 'Free'

with open('mics-geocoded.csv', 'r') as f:
    reader = csv.DictReader(f)
    mics = []
    for i, row in enumerate(reader):
        # Skip rows without coordinates
        if not row['latitude'] or not row['longitude']:
            continue

        mics.append({
            'id': i,
            'name': row['mic_name'],
            'day': row['day'],
            'startTime': row['start_time'],
            'endTime': row['end_time'] or None,
            'venue': row['venue_name'],
            'borough': row['borough'],
            'neighborhood': row['neighborhood'],
            'address': row['address'],
            'cost': clean_cost(row['cost']),
            'stageTime': (row['stage_time_minutes'] + 'min') if row['stage_time_minutes'] else '5min',
            'signup': row['signup_instructions'],
            'contact': row['organizer_contact'],
            'notes': row['notes'] or None,
            'lat': float(row['latitude']),
            'lng': float(row['longitude'])
        })

with open('mics.json', 'w') as f:
    json.dump(mics, f)

print(f"Created mics.json with {len(mics)} mics")
