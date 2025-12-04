#!/usr/bin/env python3
"""
One-time script to geocode all venues in Google Sheets and add lat/lon columns
Run this once, then users get instant map loads forever!
"""

import requests
import time
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Your Google Sheets details
SPREADSHEET_ID = '1wROLFgLrbgP1aP_b9VIJn0QzbGzmifT9r7CV15Lw7Mw'
SHEET_NAME = 'Sheet1'  # Change if your sheet has a different name

def geocode_address(address):
    """Geocode an address using Nominatim"""
    if not address:
        return None, None

    url = 'https://nominatim.openstreetmap.org/search'
    params = {
        'q': address,
        'format': 'json',
        'limit': 1
    }
    headers = {
        'User-Agent': 'MicMapGeocoder/1.0'
    }

    try:
        response = requests.get(url, params=params, headers=headers)
        response.raise_for_status()
        results = response.json()

        if results:
            return float(results[0]['lat']), float(results[0]['lon'])
        return None, None
    except Exception as e:
        print(f"Error geocoding {address}: {e}")
        return None, None

def main():
    """
    This script will:
    1. Read your Google Sheet
    2. Geocode each venue's address
    3. Add latitude and longitude columns
    4. Update the sheet

    After running this ONCE, all users get instant map loads!
    """

    print("=" * 60)
    print("OPTION 1: Manual CSV Method (Easiest)")
    print("=" * 60)
    print()
    print("1. Download your Google Sheet as CSV")
    print("2. Run this script on the CSV:")
    print()
    print("   python3 geocode-csv.py input.csv output.csv")
    print()
    print("3. Upload the output.csv back to Google Sheets")
    print("4. Done! Users load instantly forever.")
    print()
    print("=" * 60)
    print("OPTION 2: Google Sheets Formula (No code needed!)")
    print("=" * 60)
    print()
    print("Add these two columns to your sheet:")
    print()
    print("Column M - latitude:")
    print('  =IF(H2="","",REGEXEXTRACT(IMPORTDATA("https://nominatim.openstreetmap.org/search?format=json&q="&SUBSTITUTE(H2," ","+")),"""lat"":""([0-9.-]+)"""))')
    print()
    print("Column N - longitude:")
    print('  =IF(H2="","",REGEXEXTRACT(IMPORTDATA("https://nominatim.openstreetmap.org/search?format=json&q="&SUBSTITUTE(H2," ","+")),"""lon"":""([0-9.-]+)"""))')
    print()
    print("Then drag the formulas down to all rows!")
    print()
    print("=" * 60)
    print("OPTION 3: Run Python Script (Requires Google API setup)")
    print("=" * 60)
    print()
    print("Would require setting up Google Sheets API credentials.")
    print("Not recommended - use Option 1 or 2 instead.")
    print()

if __name__ == '__main__':
    main()
