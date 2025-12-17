/* =================================================================
   NYC LOCAL GEOCODER
   Zero API calls - all data ships with the app
   ================================================================= */

const nycGeocoder = {
    // NYC Neighborhoods with coordinates
    neighborhoods: [
        // Manhattan
        { name: "East Village", borough: "Manhattan", lat: 40.7265, lng: -73.9815 },
        { name: "West Village", borough: "Manhattan", lat: 40.7336, lng: -74.0027 },
        { name: "Greenwich Village", borough: "Manhattan", lat: 40.7336, lng: -73.9962 },
        { name: "SoHo", borough: "Manhattan", lat: 40.7233, lng: -73.9985 },
        { name: "NoHo", borough: "Manhattan", lat: 40.7258, lng: -73.9926 },
        { name: "Tribeca", borough: "Manhattan", lat: 40.7163, lng: -74.0086 },
        { name: "Lower East Side", borough: "Manhattan", lat: 40.7150, lng: -73.9843 },
        { name: "Chinatown", borough: "Manhattan", lat: 40.7158, lng: -73.9970 },
        { name: "Little Italy", borough: "Manhattan", lat: 40.7191, lng: -73.9973 },
        { name: "Nolita", borough: "Manhattan", lat: 40.7234, lng: -73.9945 },
        { name: "Financial District", borough: "Manhattan", lat: 40.7075, lng: -74.0089 },
        { name: "Battery Park City", borough: "Manhattan", lat: 40.7115, lng: -74.0167 },
        { name: "Chelsea", borough: "Manhattan", lat: 40.7465, lng: -74.0014 },
        { name: "Hell's Kitchen", borough: "Manhattan", lat: 40.7638, lng: -73.9918 },
        { name: "Midtown", borough: "Manhattan", lat: 40.7549, lng: -73.9840 },
        { name: "Midtown East", borough: "Manhattan", lat: 40.7549, lng: -73.9680 },
        { name: "Midtown West", borough: "Manhattan", lat: 40.7590, lng: -73.9937 },
        { name: "Times Square", borough: "Manhattan", lat: 40.7580, lng: -73.9855 },
        { name: "Murray Hill", borough: "Manhattan", lat: 40.7479, lng: -73.9757 },
        { name: "Gramercy", borough: "Manhattan", lat: 40.7367, lng: -73.9837 },
        { name: "Flatiron", borough: "Manhattan", lat: 40.7401, lng: -73.9903 },
        { name: "Union Square", borough: "Manhattan", lat: 40.7359, lng: -73.9911 },
        { name: "Kips Bay", borough: "Manhattan", lat: 40.7418, lng: -73.9780 },
        { name: "Stuyvesant Town", borough: "Manhattan", lat: 40.7317, lng: -73.9772 },
        { name: "Upper East Side", borough: "Manhattan", lat: 40.7736, lng: -73.9566 },
        { name: "Upper West Side", borough: "Manhattan", lat: 40.7870, lng: -73.9754 },
        { name: "Harlem", borough: "Manhattan", lat: 40.8116, lng: -73.9465 },
        { name: "East Harlem", borough: "Manhattan", lat: 40.7957, lng: -73.9389 },
        { name: "West Harlem", borough: "Manhattan", lat: 40.8200, lng: -73.9493 },
        { name: "Morningside Heights", borough: "Manhattan", lat: 40.8100, lng: -73.9626 },
        { name: "Washington Heights", borough: "Manhattan", lat: 40.8417, lng: -73.9394 },
        { name: "Inwood", borough: "Manhattan", lat: 40.8677, lng: -73.9212 },
        { name: "Hamilton Heights", borough: "Manhattan", lat: 40.8251, lng: -73.9476 },
        { name: "Sugar Hill", borough: "Manhattan", lat: 40.8260, lng: -73.9430 },
        { name: "Alphabet City", borough: "Manhattan", lat: 40.7234, lng: -73.9780 },
        { name: "Two Bridges", borough: "Manhattan", lat: 40.7118, lng: -73.9946 },
        { name: "Meatpacking District", borough: "Manhattan", lat: 40.7390, lng: -74.0055 },
        { name: "Hudson Yards", borough: "Manhattan", lat: 40.7542, lng: -74.0009 },
        { name: "Koreatown", borough: "Manhattan", lat: 40.7479, lng: -73.9870 },
        { name: "NoMad", borough: "Manhattan", lat: 40.7454, lng: -73.9879 },
        { name: "Rose Hill", borough: "Manhattan", lat: 40.7440, lng: -73.9820 },
        { name: "Lenox Hill", borough: "Manhattan", lat: 40.7679, lng: -73.9610 },
        { name: "Yorkville", borough: "Manhattan", lat: 40.7768, lng: -73.9497 },
        { name: "Carnegie Hill", borough: "Manhattan", lat: 40.7847, lng: -73.9553 },
        { name: "Lincoln Square", borough: "Manhattan", lat: 40.7741, lng: -73.9845 },
        { name: "Manhattan Valley", borough: "Manhattan", lat: 40.7976, lng: -73.9666 },
        { name: "Central Park", borough: "Manhattan", lat: 40.7829, lng: -73.9654 },

        // Brooklyn
        { name: "Williamsburg", borough: "Brooklyn", lat: 40.7081, lng: -73.9571 },
        { name: "Bushwick", borough: "Brooklyn", lat: 40.6944, lng: -73.9213 },
        { name: "Greenpoint", borough: "Brooklyn", lat: 40.7274, lng: -73.9503 },
        { name: "DUMBO", borough: "Brooklyn", lat: 40.7033, lng: -73.9881 },
        { name: "Brooklyn Heights", borough: "Brooklyn", lat: 40.6960, lng: -73.9936 },
        { name: "Park Slope", borough: "Brooklyn", lat: 40.6710, lng: -73.9814 },
        { name: "Cobble Hill", borough: "Brooklyn", lat: 40.6862, lng: -73.9962 },
        { name: "Carroll Gardens", borough: "Brooklyn", lat: 40.6795, lng: -73.9991 },
        { name: "Boerum Hill", borough: "Brooklyn", lat: 40.6848, lng: -73.9846 },
        { name: "Gowanus", borough: "Brooklyn", lat: 40.6738, lng: -73.9900 },
        { name: "Red Hook", borough: "Brooklyn", lat: 40.6734, lng: -74.0083 },
        { name: "Fort Greene", borough: "Brooklyn", lat: 40.6892, lng: -73.9742 },
        { name: "Clinton Hill", borough: "Brooklyn", lat: 40.6897, lng: -73.9660 },
        { name: "Bed-Stuy", borough: "Brooklyn", lat: 40.6872, lng: -73.9418 },
        { name: "Bedford-Stuyvesant", borough: "Brooklyn", lat: 40.6872, lng: -73.9418 },
        { name: "Crown Heights", borough: "Brooklyn", lat: 40.6694, lng: -73.9422 },
        { name: "Prospect Heights", borough: "Brooklyn", lat: 40.6775, lng: -73.9692 },
        { name: "Windsor Terrace", borough: "Brooklyn", lat: 40.6535, lng: -73.9755 },
        { name: "Kensington", borough: "Brooklyn", lat: 40.6388, lng: -73.9729 },
        { name: "Flatbush", borough: "Brooklyn", lat: 40.6410, lng: -73.9596 },
        { name: "Ditmas Park", borough: "Brooklyn", lat: 40.6366, lng: -73.9622 },
        { name: "Prospect Lefferts Gardens", borough: "Brooklyn", lat: 40.6594, lng: -73.9508 },
        { name: "Sunset Park", borough: "Brooklyn", lat: 40.6454, lng: -74.0104 },
        { name: "Bay Ridge", borough: "Brooklyn", lat: 40.6264, lng: -74.0299 },
        { name: "Dyker Heights", borough: "Brooklyn", lat: 40.6215, lng: -74.0095 },
        { name: "Bensonhurst", borough: "Brooklyn", lat: 40.6047, lng: -73.9936 },
        { name: "Borough Park", borough: "Brooklyn", lat: 40.6340, lng: -73.9927 },
        { name: "Midwood", borough: "Brooklyn", lat: 40.6209, lng: -73.9597 },
        { name: "Sheepshead Bay", borough: "Brooklyn", lat: 40.5916, lng: -73.9445 },
        { name: "Brighton Beach", borough: "Brooklyn", lat: 40.5780, lng: -73.9597 },
        { name: "Coney Island", borough: "Brooklyn", lat: 40.5749, lng: -73.9857 },
        { name: "Gravesend", borough: "Brooklyn", lat: 40.5973, lng: -73.9712 },
        { name: "Marine Park", borough: "Brooklyn", lat: 40.6034, lng: -73.9249 },
        { name: "Mill Basin", borough: "Brooklyn", lat: 40.6088, lng: -73.9064 },
        { name: "Canarsie", borough: "Brooklyn", lat: 40.6401, lng: -73.8961 },
        { name: "East New York", borough: "Brooklyn", lat: 40.6590, lng: -73.8759 },
        { name: "Brownsville", borough: "Brooklyn", lat: 40.6620, lng: -73.9085 },
        { name: "East Flatbush", borough: "Brooklyn", lat: 40.6530, lng: -73.9303 },
        { name: "Downtown Brooklyn", borough: "Brooklyn", lat: 40.6930, lng: -73.9866 },
        { name: "Vinegar Hill", borough: "Brooklyn", lat: 40.7036, lng: -73.9824 },
        { name: "Navy Yard", borough: "Brooklyn", lat: 40.7009, lng: -73.9695 },

        // Queens
        { name: "Astoria", borough: "Queens", lat: 40.7720, lng: -73.9173 },
        { name: "Long Island City", borough: "Queens", lat: 40.7447, lng: -73.9485 },
        { name: "Sunnyside", borough: "Queens", lat: 40.7433, lng: -73.9196 },
        { name: "Woodside", borough: "Queens", lat: 40.7454, lng: -73.9026 },
        { name: "Jackson Heights", borough: "Queens", lat: 40.7557, lng: -73.8831 },
        { name: "Elmhurst", borough: "Queens", lat: 40.7370, lng: -73.8801 },
        { name: "Corona", borough: "Queens", lat: 40.7500, lng: -73.8603 },
        { name: "Flushing", borough: "Queens", lat: 40.7654, lng: -73.8318 },
        { name: "Forest Hills", borough: "Queens", lat: 40.7196, lng: -73.8448 },
        { name: "Rego Park", borough: "Queens", lat: 40.7262, lng: -73.8624 },
        { name: "Ridgewood", borough: "Queens", lat: 40.7043, lng: -73.9018 },
        { name: "Middle Village", borough: "Queens", lat: 40.7168, lng: -73.8811 },
        { name: "Glendale", borough: "Queens", lat: 40.7032, lng: -73.8820 },
        { name: "Maspeth", borough: "Queens", lat: 40.7234, lng: -73.9126 },
        { name: "Woodhaven", borough: "Queens", lat: 40.6880, lng: -73.8566 },
        { name: "Ozone Park", borough: "Queens", lat: 40.6768, lng: -73.8432 },
        { name: "Howard Beach", borough: "Queens", lat: 40.6573, lng: -73.8365 },
        { name: "Jamaica", borough: "Queens", lat: 40.7029, lng: -73.7898 },
        { name: "Richmond Hill", borough: "Queens", lat: 40.6958, lng: -73.8272 },
        { name: "Kew Gardens", borough: "Queens", lat: 40.7142, lng: -73.8271 },
        { name: "Briarwood", borough: "Queens", lat: 40.7091, lng: -73.8149 },
        { name: "Fresh Meadows", borough: "Queens", lat: 40.7342, lng: -73.7791 },
        { name: "Bayside", borough: "Queens", lat: 40.7723, lng: -73.7779 },
        { name: "Whitestone", borough: "Queens", lat: 40.7920, lng: -73.8087 },
        { name: "College Point", borough: "Queens", lat: 40.7879, lng: -73.8460 },
        { name: "Little Neck", borough: "Queens", lat: 40.7630, lng: -73.7318 },
        { name: "Douglaston", borough: "Queens", lat: 40.7631, lng: -73.7468 },
        { name: "Glen Oaks", borough: "Queens", lat: 40.7474, lng: -73.7134 },
        { name: "Bellerose", borough: "Queens", lat: 40.7215, lng: -73.7156 },
        { name: "Queens Village", borough: "Queens", lat: 40.7268, lng: -73.7416 },
        { name: "Cambria Heights", borough: "Queens", lat: 40.6923, lng: -73.7351 },
        { name: "St. Albans", borough: "Queens", lat: 40.6903, lng: -73.7643 },
        { name: "Springfield Gardens", borough: "Queens", lat: 40.6654, lng: -73.7619 },
        { name: "Laurelton", borough: "Queens", lat: 40.6768, lng: -73.7449 },
        { name: "Rosedale", borough: "Queens", lat: 40.6623, lng: -73.7316 },
        { name: "Far Rockaway", borough: "Queens", lat: 40.6005, lng: -73.7549 },
        { name: "Rockaway Beach", borough: "Queens", lat: 40.5838, lng: -73.8161 },
        { name: "Rockaway Park", borough: "Queens", lat: 40.5795, lng: -73.8418 },
        { name: "Ditmars", borough: "Queens", lat: 40.7751, lng: -73.9120 },

        // Bronx
        { name: "South Bronx", borough: "Bronx", lat: 40.8176, lng: -73.9182 },
        { name: "Mott Haven", borough: "Bronx", lat: 40.8089, lng: -73.9229 },
        { name: "Hunts Point", borough: "Bronx", lat: 40.8095, lng: -73.8803 },
        { name: "Longwood", borough: "Bronx", lat: 40.8242, lng: -73.8964 },
        { name: "Melrose", borough: "Bronx", lat: 40.8246, lng: -73.9104 },
        { name: "Morrisania", borough: "Bronx", lat: 40.8295, lng: -73.9059 },
        { name: "Highbridge", borough: "Bronx", lat: 40.8378, lng: -73.9278 },
        { name: "Concourse", borough: "Bronx", lat: 40.8260, lng: -73.9180 },
        { name: "Fordham", borough: "Bronx", lat: 40.8595, lng: -73.8984 },
        { name: "Belmont", borough: "Bronx", lat: 40.8536, lng: -73.8888 },
        { name: "Tremont", borough: "Bronx", lat: 40.8456, lng: -73.9057 },
        { name: "University Heights", borough: "Bronx", lat: 40.8596, lng: -73.9132 },
        { name: "Kingsbridge", borough: "Bronx", lat: 40.8788, lng: -73.9025 },
        { name: "Riverdale", borough: "Bronx", lat: 40.8900, lng: -73.9125 },
        { name: "Norwood", borough: "Bronx", lat: 40.8791, lng: -73.8786 },
        { name: "Williamsbridge", borough: "Bronx", lat: 40.8796, lng: -73.8571 },
        { name: "Wakefield", borough: "Bronx", lat: 40.8949, lng: -73.8558 },
        { name: "Eastchester", borough: "Bronx", lat: 40.8875, lng: -73.8291 },
        { name: "Co-op City", borough: "Bronx", lat: 40.8743, lng: -73.8297 },
        { name: "Pelham Bay", borough: "Bronx", lat: 40.8506, lng: -73.8330 },
        { name: "Throgs Neck", borough: "Bronx", lat: 40.8227, lng: -73.8196 },
        { name: "City Island", borough: "Bronx", lat: 40.8468, lng: -73.7868 },
        { name: "Soundview", borough: "Bronx", lat: 40.8268, lng: -73.8661 },
        { name: "Parkchester", borough: "Bronx", lat: 40.8382, lng: -73.8603 },
        { name: "Castle Hill", borough: "Bronx", lat: 40.8194, lng: -73.8514 },
        { name: "Westchester Square", borough: "Bronx", lat: 40.8392, lng: -73.8426 },
        { name: "Morris Park", borough: "Bronx", lat: 40.8526, lng: -73.8554 },
        { name: "Van Nest", borough: "Bronx", lat: 40.8472, lng: -73.8637 },
        { name: "Bronxdale", borough: "Bronx", lat: 40.8533, lng: -73.8653 },
        { name: "Allerton", borough: "Bronx", lat: 40.8654, lng: -73.8672 },

        // Staten Island
        { name: "St. George", borough: "Staten Island", lat: 40.6437, lng: -74.0764 },
        { name: "Stapleton", borough: "Staten Island", lat: 40.6267, lng: -74.0755 },
        { name: "Tompkinsville", borough: "Staten Island", lat: 40.6362, lng: -74.0780 },
        { name: "Port Richmond", borough: "Staten Island", lat: 40.6334, lng: -74.1373 },
        { name: "West Brighton", borough: "Staten Island", lat: 40.6273, lng: -74.1112 },
        { name: "New Brighton", borough: "Staten Island", lat: 40.6428, lng: -74.0930 },
        { name: "Snug Harbor", borough: "Staten Island", lat: 40.6429, lng: -74.1025 },
        { name: "Westerleigh", borough: "Staten Island", lat: 40.6212, lng: -74.1317 },
        { name: "Graniteville", borough: "Staten Island", lat: 40.6161, lng: -74.1503 },
        { name: "Bulls Head", borough: "Staten Island", lat: 40.5969, lng: -74.1618 },
        { name: "New Springville", borough: "Staten Island", lat: 40.5931, lng: -74.1631 },
        { name: "Travis", borough: "Staten Island", lat: 40.5901, lng: -74.1867 },
        { name: "Tottenville", borough: "Staten Island", lat: 40.5077, lng: -74.2366 },
        { name: "Great Kills", borough: "Staten Island", lat: 40.5545, lng: -74.1517 },
        { name: "Eltingville", borough: "Staten Island", lat: 40.5446, lng: -74.1647 },
        { name: "Annadale", borough: "Staten Island", lat: 40.5395, lng: -74.1783 },
        { name: "Huguenot", borough: "Staten Island", lat: 40.5324, lng: -74.1925 },
        { name: "Rossville", borough: "Staten Island", lat: 40.5543, lng: -74.2133 },
        { name: "Charleston", borough: "Staten Island", lat: 40.5340, lng: -74.2369 },
        { name: "Pleasant Plains", borough: "Staten Island", lat: 40.5227, lng: -74.2186 },
        { name: "Richmond Valley", borough: "Staten Island", lat: 40.5135, lng: -74.2228 },
        { name: "Dongan Hills", borough: "Staten Island", lat: 40.5882, lng: -74.0996 },
        { name: "Midland Beach", borough: "Staten Island", lat: 40.5723, lng: -74.0947 },
        { name: "New Dorp", borough: "Staten Island", lat: 40.5738, lng: -74.1173 },
        { name: "Oakwood", borough: "Staten Island", lat: 40.5638, lng: -74.1227 },
        { name: "South Beach", borough: "Staten Island", lat: 40.5838, lng: -74.0705 },
        { name: "Rosebank", borough: "Staten Island", lat: 40.6127, lng: -74.0658 },
        { name: "Clifton", borough: "Staten Island", lat: 40.6180, lng: -74.0717 },
        { name: "Concord", borough: "Staten Island", lat: 40.6080, lng: -74.0835 },
        { name: "Todt Hill", borough: "Staten Island", lat: 40.6018, lng: -74.1050 },
    ],

    // Major subway stations (simplified - key stations)
    subwayStations: [
        // Manhattan - Major Hubs
        { name: "Times Square-42nd St", lines: "1237ACENQRSW", lat: 40.7559, lng: -73.9871 },
        { name: "Grand Central-42nd St", lines: "4567S", lat: 40.7527, lng: -73.9772 },
        { name: "Penn Station-34th St", lines: "123ACE", lat: 40.7506, lng: -73.9935 },
        { name: "Herald Square-34th St", lines: "BDFMNQRW", lat: 40.7496, lng: -73.9876 },
        { name: "Union Square-14th St", lines: "456LNQRW", lat: 40.7356, lng: -73.9906 },
        { name: "14th St-6th Ave", lines: "FLM123", lat: 40.7381, lng: -73.9966 },
        { name: "West 4th St", lines: "ABCDEFM", lat: 40.7322, lng: -74.0003 },
        { name: "Broadway-Lafayette St", lines: "BDFM6", lat: 40.7254, lng: -73.9962 },
        { name: "Astor Place", lines: "6", lat: 40.7300, lng: -73.9910 },
        { name: "8th St-NYU", lines: "NRW", lat: 40.7303, lng: -73.9925 },
        { name: "Christopher St-Sheridan Sq", lines: "1", lat: 40.7334, lng: -74.0027 },
        { name: "Houston St", lines: "1", lat: 40.7283, lng: -74.0052 },
        { name: "Canal St", lines: "JNQRWZ6", lat: 40.7191, lng: -73.9999 },
        { name: "Chambers St", lines: "123ACE", lat: 40.7142, lng: -74.0087 },
        { name: "Fulton St", lines: "2345ACJZ", lat: 40.7102, lng: -74.0073 },
        { name: "Wall St", lines: "23", lat: 40.7068, lng: -74.0091 },
        { name: "Bowling Green", lines: "45", lat: 40.7043, lng: -74.0142 },
        { name: "South Ferry", lines: "1", lat: 40.7019, lng: -74.0131 },
        { name: "World Trade Center", lines: "E", lat: 40.7126, lng: -74.0099 },
        { name: "Cortlandt St", lines: "NRW1", lat: 40.7118, lng: -74.0112 },
        { name: "Park Place", lines: "23", lat: 40.7131, lng: -74.0087 },
        { name: "City Hall", lines: "NRW", lat: 40.7138, lng: -74.0069 },
        { name: "Brooklyn Bridge-City Hall", lines: "456JZ", lat: 40.7133, lng: -74.0031 },
        { name: "Spring St", lines: "CE6", lat: 40.7224, lng: -73.9974 },
        { name: "Prince St", lines: "NRW", lat: 40.7242, lng: -73.9977 },
        { name: "Bleecker St", lines: "6", lat: 40.7259, lng: -73.9946 },
        { name: "1st Ave", lines: "L", lat: 40.7307, lng: -73.9817 },
        { name: "3rd Ave", lines: "L", lat: 40.7327, lng: -73.9859 },
        { name: "6th Ave", lines: "L", lat: 40.7376, lng: -73.9969 },
        { name: "14th St-8th Ave", lines: "ACE", lat: 40.7403, lng: -74.0002 },
        { name: "23rd St", lines: "CEFM1NRW6", lat: 40.7428, lng: -73.9929 },
        { name: "28th St", lines: "16NRW", lat: 40.7454, lng: -73.9886 },
        { name: "33rd St", lines: "6", lat: 40.7463, lng: -73.9822 },
        { name: "42nd St-Bryant Park", lines: "BDFM7", lat: 40.7542, lng: -73.9841 },
        { name: "47-50th Sts-Rockefeller Ctr", lines: "BDFM", lat: 40.7588, lng: -73.9814 },
        { name: "49th St", lines: "NRW", lat: 40.7599, lng: -73.9841 },
        { name: "50th St", lines: "CE1", lat: 40.7619, lng: -73.9872 },
        { name: "51st St", lines: "6", lat: 40.7571, lng: -73.9720 },
        { name: "53rd St", lines: "EM", lat: 40.7601, lng: -73.9903 },
        { name: "57th St", lines: "FNQRW", lat: 40.7644, lng: -73.9773 },
        { name: "57th St-7th Ave", lines: "NQR", lat: 40.7649, lng: -73.9807 },
        { name: "59th St-Columbus Circle", lines: "1ABCD", lat: 40.7681, lng: -73.9819 },
        { name: "5th Ave-53rd St", lines: "EM", lat: 40.7603, lng: -73.9753 },
        { name: "Lexington Ave-53rd St", lines: "EM6", lat: 40.7578, lng: -73.9690 },
        { name: "Lexington Ave-59th St", lines: "456NRW", lat: 40.7627, lng: -73.9670 },
        { name: "66th St-Lincoln Center", lines: "1", lat: 40.7735, lng: -73.9823 },
        { name: "72nd St", lines: "123BC", lat: 40.7785, lng: -73.9819 },
        { name: "79th St", lines: "1", lat: 40.7839, lng: -73.9798 },
        { name: "86th St", lines: "1456BC", lat: 40.7888, lng: -73.9763 },
        { name: "96th St", lines: "123BC", lat: 40.7939, lng: -73.9723 },
        { name: "103rd St", lines: "16BC", lat: 40.7996, lng: -73.9685 },
        { name: "110th St-Cathedral Pkwy", lines: "1BC", lat: 40.8050, lng: -73.9668 },
        { name: "116th St-Columbia University", lines: "1", lat: 40.8080, lng: -73.9641 },
        { name: "125th St", lines: "1234567ABCD", lat: 40.8157, lng: -73.9585 },
        { name: "135th St", lines: "23BC", lat: 40.8180, lng: -73.9477 },
        { name: "145th St", lines: "13ABCD", lat: 40.8261, lng: -73.9445 },
        { name: "155th St", lines: "BCD", lat: 40.8303, lng: -73.9383 },
        { name: "163rd St-Amsterdam Ave", lines: "C", lat: 40.8361, lng: -73.9398 },
        { name: "168th St", lines: "1AC", lat: 40.8408, lng: -73.9397 },
        { name: "175th St", lines: "A", lat: 40.8476, lng: -73.9398 },
        { name: "181st St", lines: "1A", lat: 40.8519, lng: -73.9337 },
        { name: "190th St", lines: "A", lat: 40.8590, lng: -73.9340 },
        { name: "191st St", lines: "1", lat: 40.8553, lng: -73.9293 },
        { name: "Dyckman St", lines: "1A", lat: 40.8607, lng: -73.9256 },
        { name: "207th St", lines: "1", lat: 40.8648, lng: -73.9189 },
        { name: "215th St", lines: "1", lat: 40.8694, lng: -73.9153 },
        { name: "Inwood-207th St", lines: "A", lat: 40.8681, lng: -73.9199 },

        // Brooklyn - Major Stations
        { name: "Atlantic Ave-Barclays Ctr", lines: "2345BDNQR", lat: 40.6840, lng: -73.9786 },
        { name: "Jay St-MetroTech", lines: "ACFNR", lat: 40.6923, lng: -73.9872 },
        { name: "DeKalb Ave", lines: "BDNQR", lat: 40.6907, lng: -73.9818 },
        { name: "Hoyt-Schermerhorn Sts", lines: "ACGC", lat: 40.6884, lng: -73.9850 },
        { name: "Borough Hall", lines: "2345NR", lat: 40.6926, lng: -73.9901 },
        { name: "Court St", lines: "NR", lat: 40.6941, lng: -73.9919 },
        { name: "High St", lines: "AC", lat: 40.6994, lng: -73.9908 },
        { name: "York St", lines: "F", lat: 40.7014, lng: -73.9867 },
        { name: "Clark St", lines: "23", lat: 40.6975, lng: -73.9930 },
        { name: "Bergen St", lines: "234FG", lat: 40.6866, lng: -73.9755 },
        { name: "7th Ave", lines: "FG", lat: 40.6700, lng: -73.9800 },
        { name: "15th St-Prospect Park", lines: "FG", lat: 40.6603, lng: -73.9797 },
        { name: "Church Ave", lines: "2BQ5", lat: 40.6509, lng: -73.9630 },
        { name: "Bedford-Nostrand Aves", lines: "G", lat: 40.6897, lng: -73.9535 },
        { name: "Bedford Ave", lines: "L", lat: 40.7178, lng: -73.9570 },
        { name: "Lorimer St", lines: "LG", lat: 40.7140, lng: -73.9504 },
        { name: "Marcy Ave", lines: "JMZ", lat: 40.7082, lng: -73.9578 },
        { name: "Myrtle-Wyckoff Aves", lines: "LM", lat: 40.6994, lng: -73.9120 },
        { name: "Jefferson St", lines: "L", lat: 40.7066, lng: -73.9229 },
        { name: "Morgan Ave", lines: "L", lat: 40.7062, lng: -73.9331 },
        { name: "Montrose Ave", lines: "L", lat: 40.7074, lng: -73.9399 },
        { name: "Graham Ave", lines: "L", lat: 40.7143, lng: -73.9443 },
        { name: "Grand St", lines: "L", lat: 40.7118, lng: -73.9406 },
        { name: "Greenpoint Ave", lines: "G", lat: 40.7313, lng: -73.9544 },
        { name: "Nassau Ave", lines: "G", lat: 40.7244, lng: -73.9512 },
        { name: "Metropolitan Ave", lines: "GL", lat: 40.7126, lng: -73.9514 },
        { name: "Flushing Ave", lines: "JMG", lat: 40.7004, lng: -73.9414 },
        { name: "Broadway Junction", lines: "ACJLZ", lat: 40.6783, lng: -73.9044 },
        { name: "Bushwick Ave-Aberdeen St", lines: "L", lat: 40.6829, lng: -73.9052 },
        { name: "Wilson Ave", lines: "L", lat: 40.6888, lng: -73.9041 },
        { name: "Halsey St", lines: "L", lat: 40.6955, lng: -73.9041 },
        { name: "Canarsie-Rockaway Pkwy", lines: "L", lat: 40.6468, lng: -73.9020 },

        // Queens - Major Stations
        { name: "Court Sq", lines: "EMG7", lat: 40.7473, lng: -73.9453 },
        { name: "Queensboro Plaza", lines: "7NW", lat: 40.7509, lng: -73.9402 },
        { name: "Queens Plaza", lines: "EMR", lat: 40.7489, lng: -73.9372 },
        { name: "Roosevelt Ave-Jackson Heights", lines: "7EFMR", lat: 40.7465, lng: -73.8912 },
        { name: "74th St-Broadway", lines: "7", lat: 40.7468, lng: -73.8914 },
        { name: "Flushing-Main St", lines: "7", lat: 40.7596, lng: -73.8300 },
        { name: "Mets-Willets Point", lines: "7", lat: 40.7546, lng: -73.8456 },
        { name: "Jamaica Center", lines: "EJZ", lat: 40.7021, lng: -73.8009 },
        { name: "Sutphin Blvd-Archer Ave", lines: "EJZ", lat: 40.7003, lng: -73.8077 },
        { name: "Jamaica-179th St", lines: "F", lat: 40.7126, lng: -73.7837 },
        { name: "Forest Hills-71st Ave", lines: "EFMR", lat: 40.7215, lng: -73.8444 },
        { name: "Kew Gardens-Union Tpke", lines: "EF", lat: 40.7140, lng: -73.8310 },
        { name: "Astoria-Ditmars Blvd", lines: "NW", lat: 40.7751, lng: -73.9120 },
        { name: "Astoria Blvd", lines: "NW", lat: 40.7700, lng: -73.9180 },
        { name: "30th Ave", lines: "NW", lat: 40.7665, lng: -73.9216 },
        { name: "Broadway", lines: "NW", lat: 40.7619, lng: -73.9256 },
        { name: "36th Ave", lines: "NW", lat: 40.7563, lng: -73.9298 },
        { name: "39th Ave", lines: "NW", lat: 40.7528, lng: -73.9325 },
        { name: "Steinway St", lines: "MR", lat: 40.7564, lng: -73.9206 },
        { name: "46th St", lines: "MR", lat: 40.7563, lng: -73.9133 },
        { name: "Northern Blvd", lines: "MR", lat: 40.7527, lng: -73.9064 },
        { name: "Woodhaven Blvd", lines: "MR", lat: 40.7332, lng: -73.8694 },
        { name: "63rd Dr-Rego Park", lines: "MR", lat: 40.7295, lng: -73.8617 },
        { name: "67th Ave", lines: "MR", lat: 40.7264, lng: -73.8528 },

        // Bronx - Major Stations
        { name: "149th St-Grand Concourse", lines: "245", lat: 40.8183, lng: -73.9273 },
        { name: "161st St-Yankee Stadium", lines: "4BD", lat: 40.8279, lng: -73.9257 },
        { name: "167th St", lines: "4BD", lat: 40.8359, lng: -73.9214 },
        { name: "170th St", lines: "4B", lat: 40.8395, lng: -73.9174 },
        { name: "Fordham Rd", lines: "4BD", lat: 40.8621, lng: -73.8903 },
        { name: "Kingsbridge Rd", lines: "4BD", lat: 40.8676, lng: -73.8973 },
        { name: "Bedford Park Blvd", lines: "4BD", lat: 40.8732, lng: -73.8900 },
        { name: "Norwood-205th St", lines: "D", lat: 40.8748, lng: -73.8789 },
        { name: "Pelham Bay Park", lines: "6", lat: 40.8522, lng: -73.8281 },
        { name: "Westchester Sq-E Tremont Ave", lines: "6", lat: 40.8394, lng: -73.8429 },
        { name: "Parkchester", lines: "6", lat: 40.8332, lng: -73.8610 },
        { name: "Castle Hill Ave", lines: "6", lat: 40.8344, lng: -73.8512 },
        { name: "Hunts Point Ave", lines: "6", lat: 40.8208, lng: -73.8907 },
        { name: "3rd Ave-138th St", lines: "6", lat: 40.8103, lng: -73.9262 },
        { name: "Brook Ave", lines: "6", lat: 40.8076, lng: -73.9192 },
        { name: "Cypress Ave", lines: "6", lat: 40.8054, lng: -73.9140 },
        { name: "E 143rd St-St Mary's St", lines: "6", lat: 40.8088, lng: -73.9076 },
        { name: "E 149th St", lines: "6", lat: 40.8121, lng: -73.9041 },
        { name: "Longwood Ave", lines: "6", lat: 40.8160, lng: -73.8962 },
        { name: "E 177th St", lines: "6", lat: 40.8481, lng: -73.8878 },
        { name: "Pelham Pkwy", lines: "25", lat: 40.8571, lng: -73.8675 },
        { name: "Gun Hill Rd", lines: "25", lat: 40.8775, lng: -73.8662 },
        { name: "Burke Ave", lines: "25", lat: 40.8712, lng: -73.8673 },
        { name: "Allerton Ave", lines: "25", lat: 40.8654, lng: -73.8673 },
        { name: "Bronx Park East", lines: "25", lat: 40.8489, lng: -73.8683 },
        { name: "E 180th St", lines: "25", lat: 40.8418, lng: -73.8735 },
        { name: "West Farms Sq-E Tremont Ave", lines: "25", lat: 40.8401, lng: -73.8799 },
        { name: "174th St", lines: "25", lat: 40.8372, lng: -73.8875 },
        { name: "Freeman St", lines: "25", lat: 40.8299, lng: -73.8918 },
        { name: "Simpson St", lines: "25", lat: 40.8241, lng: -73.8930 },
        { name: "Intervale Ave", lines: "25", lat: 40.8221, lng: -73.8964 },
        { name: "Prospect Ave", lines: "25", lat: 40.8196, lng: -73.9017 },
        { name: "Jackson Ave", lines: "25", lat: 40.8165, lng: -73.9078 },
        { name: "3rd Ave-149th St", lines: "25", lat: 40.8161, lng: -73.9176 },
    ],

    // Common abbreviations
    abbreviations: {
        'uws': 'Upper West Side',
        'ues': 'Upper East Side',
        'les': 'Lower East Side',
        'ev': 'East Village',
        'wv': 'West Village',
        'gv': 'Greenwich Village',
        'fidi': 'Financial District',
        'hk': 'Hell\'s Kitchen',
        'bk': 'Brooklyn',
        'wburg': 'Williamsburg',
        'willy': 'Williamsburg',
        'willy b': 'Williamsburg',
        'gpoint': 'Greenpoint',
        'bk heights': 'Brooklyn Heights',
        'bkh': 'Brooklyn Heights',
        'dt bk': 'Downtown Brooklyn',
        'dumbo': 'DUMBO',
        'cobble': 'Cobble Hill',
        'cg': 'Carroll Gardens',
        'fg': 'Fort Greene',
        'ch': 'Clinton Hill',
        'bed stuy': 'Bed-Stuy',
        'bs': 'Bed-Stuy',
        'plg': 'Prospect Lefferts Gardens',
        'ps': 'Park Slope',
        'ph': 'Prospect Heights',
        'cp': 'Central Park',
        'lic': 'Long Island City',
        'jh': 'Jackson Heights',
        'fh': 'Forest Hills',
        'rw': 'Ridgewood',
        'ast': 'Astoria',
        'ts': 'Times Square',
        'gc': 'Grand Central',
        'penn': 'Penn Station',
        'usq': 'Union Square',
        'wsq': 'Washington Square',
        'nolita': 'Nolita',
        'noho': 'NoHo',
        'soho': 'SoHo',
        'tribeca': 'Tribeca',
        'nomad': 'NoMad',
        'mpd': 'Meatpacking District',
        'meatpacking': 'Meatpacking District',
        'hy': 'Hudson Yards',
        'ktown': 'Koreatown',
        'morningside': 'Morningside Heights',
        'wash heights': 'Washington Heights',
        'wahi': 'Washington Heights',
        'sbx': 'South Bronx',
        'si': 'Staten Island',
        'ri': 'Roosevelt Island',
    },

    // Search function - returns matching locations
    search(query) {
        if (!query || query.length < 2) return [];

        let q = query.toLowerCase().trim();

        // Check if query is an abbreviation and expand it
        if (this.abbreviations[q]) {
            q = this.abbreviations[q].toLowerCase();
        }

        const results = [];

        // Search neighborhoods
        this.neighborhoods.forEach(hood => {
            const score = this.matchScore(q, hood.name, hood.borough);
            if (score > 0) {
                results.push({
                    type: 'neighborhood',
                    name: hood.name,
                    sub: hood.borough,
                    lat: hood.lat,
                    lng: hood.lng,
                    score
                });
            }
        });

        // Search subway stations
        this.subwayStations.forEach(station => {
            const score = this.matchScore(q, station.name, station.lines);
            if (score > 0) {
                results.push({
                    type: 'subway',
                    name: station.name,
                    sub: station.lines.split('').join(' '),
                    lat: station.lat,
                    lng: station.lng,
                    score
                });
            }
        });

        // Sort by score (best matches first) and limit results
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);
    },

    // Simple scoring: exact start > word start > contains > fuzzy
    matchScore(query, name, extra = '') {
        const nameLower = name.toLowerCase();
        const extraLower = (extra || '').toLowerCase();

        // Exact start of name = highest score
        if (nameLower.startsWith(query)) return 100;

        // Word starts with query
        const words = nameLower.split(/[\s\-]/);
        if (words.some(w => w.startsWith(query))) return 80;

        // Contains query
        if (nameLower.includes(query)) return 60;

        // Check extra field (borough, subway lines)
        if (extraLower.includes(query)) return 40;

        // Fuzzy match - allow typos (only for queries 4+ chars)
        if (query.length >= 4) {
            const distance = this.levenshtein(query, nameLower.substring(0, query.length + 2));
            // Allow 1 typo for 4-6 chars, 2 typos for 7+ chars
            const maxDistance = query.length >= 7 ? 2 : 1;
            if (distance <= maxDistance) return 30;

            // Also check each word
            for (const word of words) {
                if (word.length >= 3) {
                    const wordDist = this.levenshtein(query, word);
                    if (wordDist <= maxDistance) return 25;
                }
            }
        }

        return 0;
    },

    // Levenshtein distance for fuzzy matching
    levenshtein(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix = [];

        // Build matrix
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        // Fill matrix
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }
};

// Export for use in search.js
window.nycGeocoder = nycGeocoder;
