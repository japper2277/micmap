const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapePIT() {
    console.log('🎭 Scraping The PIT NYC...\n');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    await page.goto('https://thepit-nyc.com/calendar/', {
        waitUntil: 'networkidle2',
        timeout: 30000
    });

    await new Promise(r => setTimeout(r, 3000));

    // Extract structured event data from the calendar
    const events = await page.evaluate(() => {
        const results = [];

        // The PIT calendar uses a day-by-day structure
        // Look for all event entries
        const allText = document.body.innerText;

        // Split by date markers (DEC1, DEC2, etc.)
        const datePattern = /((?:DEC|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV)\d+)/gi;
        const parts = allText.split(datePattern);

        let currentDate = null;
        let currentMonth = 'December';
        let currentYear = '2025';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();

            // Check if this is a date marker
            const dateMatch = part.match(/^(DEC|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV)(\d+)$/i);
            if (dateMatch) {
                const monthMap = {
                    'JAN': 'January', 'FEB': 'February', 'MAR': 'March',
                    'APR': 'April', 'MAY': 'May', 'JUN': 'June',
                    'JUL': 'July', 'AUG': 'August', 'SEP': 'September',
                    'OCT': 'October', 'NOV': 'November', 'DEC': 'December'
                };
                currentMonth = monthMap[dateMatch[1].toUpperCase()];
                currentDate = parseInt(dateMatch[2]);
                continue;
            }

            // Parse events from this day's content
            if (currentDate && part.length > 10) {
                // Split into lines and look for event patterns
                const lines = part.split('\n').map(l => l.trim()).filter(l => l);

                for (let j = 0; j < lines.length; j++) {
                    const line = lines[j];

                    // Skip navigation/header items
                    if (line.match(/^(MON|TUE|WED|THU|FRI|SAT|SUN|DECEMBER|JANUARY|NOVEMBER|Skip|SUBMIT|Show Calendar|All|Under)/i)) {
                        continue;
                    }

                    // Look for time pattern (e.g., "4:30pm", "7:00pm")
                    const timeMatch = line.match(/^(\d{1,2}:\d{2}(?:am|pm)?)$/i);
                    if (timeMatch && j > 0) {
                        // Previous line is likely the event name
                        const eventName = lines[j - 1];
                        const time = timeMatch[1];
                        const venue = lines[j + 1] || 'The PIT';

                        // Check if it's an open mic or jam
                        const nameLower = eventName.toLowerCase();
                        const isMicOrJam = nameLower.includes('mic') ||
                                          nameLower.includes('jam') ||
                                          nameLower.includes('open');

                        if (eventName && eventName.length > 3 && eventName.length < 100) {
                            results.push({
                                name: eventName,
                                date: `${currentMonth} ${currentDate}, ${currentYear}`,
                                day: new Date(`${currentMonth} ${currentDate}, ${currentYear}`).toLocaleDateString('en-US', { weekday: 'long' }),
                                time: time,
                                venue: venue.includes('PIT') || venue.includes('Fishbowl') || venue.includes('LAB') ? venue : 'The PIT NYC',
                                isMicOrJam: isMicOrJam,
                                type: nameLower.includes('jam') ? 'jam' : (nameLower.includes('mic') ? 'open_mic' : 'show')
                            });
                        }
                    }
                }
            }
        }

        return results;
    });

    await browser.close();

    // Filter to just mics and jams
    const micsAndJams = events.filter(e => e.isMicOrJam);
    const shows = events.filter(e => !e.isMicOrJam);

    console.log(`📊 Found ${events.length} total events`);
    console.log(`   🎤 ${micsAndJams.length} Open Mics & Jams`);
    console.log(`   🎭 ${shows.length} Shows\n`);

    // Display mics and jams
    console.log('=== OPEN MICS & JAMS ===\n');

    // Group by day of week
    const byDay = {};
    micsAndJams.forEach(e => {
        if (!byDay[e.day]) byDay[e.day] = [];
        byDay[e.day].push(e);
    });

    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    dayOrder.forEach(day => {
        if (byDay[day]) {
            console.log(`${day.toUpperCase()}:`);
            // Get unique events (same name = same recurring event)
            const unique = {};
            byDay[day].forEach(e => {
                const key = `${e.name}-${e.time}`;
                if (!unique[key]) unique[key] = e;
            });
            Object.values(unique).forEach(e => {
                console.log(`  ${e.time.padEnd(8)} ${e.name}`);
                console.log(`           @ ${e.venue}`);
            });
            console.log('');
        }
    });

    // Save results
    const output = {
        scrapedAt: new Date().toISOString(),
        source: 'The PIT NYC',
        sourceUrl: 'https://thepit-nyc.com/calendar/',
        address: '154 W 29th St, New York, NY 10001',
        micsAndJams: micsAndJams,
        allEvents: events
    };

    fs.writeFileSync('scrapers/pit-events.json', JSON.stringify(output, null, 2));
    console.log('\n💾 Saved to scrapers/pit-events.json');

    return output;
}

scrapePIT().catch(console.error);
