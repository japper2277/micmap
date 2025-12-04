// =============================================================================
// VENUE ADDRESS LOOKUP - Street addresses for better geocoding
// =============================================================================
//
// Add known street addresses here to improve geocoding accuracy
// Format: 'Venue Name': 'Street Address'
//
// This is optional but helps when venue names alone don't geocode well
// =============================================================================

const VENUE_ADDRESSES = {
    // Manhattan
    'The Grisly Pear': '61 7th Ave S, New York, NY 10014',
    'The Comic Strip Live': '1568 2nd Ave, New York, NY 10028',
    'Comic Strip Live': '1568 2nd Ave, New York, NY 10028',
    'Broadway Comedy Club': '318 W 53rd St, New York, NY 10019',
    'New York Comedy Club (East)': '241 E 24th St, New York, NY 10010',
    'Greenwich Village Comedy Club': '99 MacDougal St, New York, NY 10012',
    'The Stand NYC': '239 3rd Ave, New York, NY 10003',
    'West Side Comedy Club': '201 W 75th St, New York, NY 10023',
    'The Peoples Improv Theater': '123 E 24th St, New York, NY 10010',
    'The Peoples Improv Theater (PIT)': '123 E 24th St, New York, NY 10010',

    // Brooklyn
    'EastVille Comedy Club': '277 Bedford Ave, Brooklyn, NY 11211',
    'Pine Box Rock Shop': '12 Grattan St, Brooklyn, NY 11206',
    'Alligator Lounge': '600 Metropolitan Ave, Brooklyn, NY 11211',
    'The Dojo of Comedy': '190 Berry St, Brooklyn, NY 11249',
    'Brooklyn House of Comedy': '769 Bushwick Ave, Brooklyn, NY 11221',
    "Young Ethel's": '538 Union St, Brooklyn, NY 11215',

    // Queens
    'The Secret Loft': '23-01 33rd Rd, Queens, NY 11106',
    'Q.E.D. Astoria': '27-16 23rd Ave, Queens, NY 11105',
    'Laughing Devil Comedy Club': '47-38 Vernon Blvd, Long Island City, NY 11101',

    // Additional venues from API
    'The Grisly Pear Buddha Mic': '61 7th Ave S, New York, NY 10014', // Same as Grisly Pear
    'The Grisly Pear - Midtown': '61 7th Ave S, New York, NY 10014', // Same location
    'Second City Mic': '64 N 9th St, Brooklyn, NY 11249',
    'The Second City New York': '64 N 9th St, Brooklyn, NY 11249',
    'loose lips mic': '709 Lorimer St, Brooklyn, NY 11211',
    'loose lips': '709 Lorimer St, Brooklyn, NY 11211',
    "Pete's Candy Store": '709 Lorimer St, Brooklyn, NY 11211',
    'Comedy Shop': '167 Bleecker St, New York, NY 10012',
    'Fear City Mic': '17 Essex St, New York, NY 10002',
    'The Fear City Comedy Club': '17 Essex St, New York, NY 10002',
    'Fear City': '17 Essex St, New York, NY 10002'

    // Add more addresses as needed
    // You can find these by searching the venue on Google Maps
};

/**
 * Get street address for a venue if available
 * @param {string} venueName - Name of the venue
 * @returns {string|null} - Street address or null if not found
 */
function getVenueAddress(venueName) {
    // Clean the venue name (remove time suffixes)
    const cleanName = venueName.replace(/\s*\((Evening|Late|Afternoon|Early)\)\s*/gi, '').trim();

    return VENUE_ADDRESSES[cleanName] || null;
}

/**
 * Check if we have a street address for this venue
 * @param {string} venueName - Name of the venue
 * @returns {boolean}
 */
function hasVenueAddress(venueName) {
    return getVenueAddress(venueName) !== null;
}
