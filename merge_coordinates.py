#!/usr/bin/env python3
"""
Merge coordinates from venues-with-coordinates.csv into the Malev open mics CSV.
Uses fuzzy matching to handle variations in venue names.
"""

import csv
from difflib import SequenceMatcher
import re

def normalize_venue_name(name):
    """Normalize venue name for better matching."""
    if not name:
        return ""
    # Convert to lowercase
    name = name.lower().strip()
    # Remove common prefixes
    name = re.sub(r'^the\s+', '', name)
    # Remove extra whitespace
    name = re.sub(r'\s+', ' ', name)
    # Remove punctuation
    name = re.sub(r'[^\w\s]', '', name)
    return name

def similarity_score(str1, str2):
    """Calculate similarity score between two strings (0-1)."""
    return SequenceMatcher(None, str1, str2).ratio()

def find_best_match(venue_name, coordinates_dict, threshold=0.7):
    """
    Find the best matching venue from coordinates_dict.
    Returns (lat, lon) tuple or (None, None) if no good match found.
    """
    if not venue_name:
        return None, None

    normalized_target = normalize_venue_name(venue_name)
    best_score = 0
    best_match = None

    for coord_venue_name, (lat, lon) in coordinates_dict.items():
        score = similarity_score(normalized_target, normalize_venue_name(coord_venue_name))
        if score > best_score:
            best_score = score
            best_match = (lat, lon, coord_venue_name)

    if best_score >= threshold and best_match:
        print(f"Matched '{venue_name}' -> '{best_match[2]}' (score: {best_score:.2f})")
        return best_match[0], best_match[1]

    return None, None

def load_coordinates(filepath):
    """Load coordinates from venues-with-coordinates.csv."""
    coordinates = {}
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            venue_name = row.get('venueName', '').strip()
            lat = row.get('lat', '').strip()
            lon = row.get('lon', '').strip()

            if venue_name and lat and lon:
                coordinates[venue_name] = (lat, lon)

    print(f"Loaded {len(coordinates)} venues with coordinates\n")
    return coordinates

def merge_coordinates(malev_csv, coordinates_csv, output_csv):
    """Merge coordinates into Malev CSV."""
    # Load coordinates
    coordinates_dict = load_coordinates(coordinates_csv)

    # Process Malev CSV
    matched_count = 0
    total_count = 0

    with open(malev_csv, 'r', encoding='utf-8') as infile, \
         open(output_csv, 'w', encoding='utf-8', newline='') as outfile:

        reader = csv.reader(infile)

        # Skip first line (website header)
        next(reader)

        # Second line is the actual header
        header = next(reader)

        # Add lat/lon columns to header
        header_out = header + ['lat', 'lon']

        writer = csv.writer(outfile)
        writer.writerow(header_out)

        # Find the "Venue Name" column index
        try:
            venue_name_idx = header.index('Venue Name')
        except ValueError:
            print("Error: Could not find 'Venue Name' column in CSV")
            return

        # Process each row
        for row in reader:
            if len(row) <= venue_name_idx:
                # Empty or malformed row
                writer.writerow(row + ['', ''])
                continue

            venue_name = row[venue_name_idx].strip()

            # Skip completely empty rows
            if not any(row):
                writer.writerow(row + ['', ''])
                continue

            # Only count non-empty rows
            if venue_name:
                total_count += 1

                # Try to find matching coordinates
                lat, lon = find_best_match(venue_name, coordinates_dict)

                if lat and lon:
                    matched_count += 1
                    writer.writerow(row + [lat, lon])
                else:
                    writer.writerow(row + ['', ''])
            else:
                # Empty venue name
                writer.writerow(row + ['', ''])

    print(f"\n✓ Merge complete!")
    print(f"  Total venues processed: {total_count}")
    print(f"  Venues matched with coordinates: {matched_count}")
    print(f"  Venues without coordinates: {total_count - matched_count}")
    print(f"  Match rate: {matched_count/total_count*100:.1f}%" if total_count > 0 else "  No venues found")
    print(f"  Output saved to: {output_csv}")

if __name__ == "__main__":
    malev_csv = "/Users/jaredapper/Downloads/9.5.25 NYC Open Mics by Malev (easier at www.comediq.us) - 2025 Everyday Mics.csv"
    coordinates_csv = "/Users/jaredapper/Desktop/micmap/venues-with-coordinates.csv"
    output_csv = "/Users/jaredapper/Desktop/micmap/merged-mics-with-coordinates.csv"

    merge_coordinates(malev_csv, coordinates_csv, output_csv)
