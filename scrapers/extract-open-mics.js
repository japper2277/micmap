const fs = require('fs');

// Load scraped data
const data = JSON.parse(fs.readFileSync('scrapers/scraped-mics.json', 'utf8'));

const openMics = [];

// ============================================
// EXTRACT FROM THE PIT (best structured data)
// ============================================
const pitText = data.sources.thePit?.rawText || '';

// Parse The PIT calendar format
// Pattern: "DEC1" followed by events with times and venues
const pitLines = pitText.split('\n');
let currentDate = null;

for (let i = 0; i < pitLines.length; i++) {
    const line = pitLines[i].trim();

    // Match date headers like "DEC1", "DEC2", etc
    const dateMatch = line.match(/^(DEC|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV)(\d+)$/i);
    if (dateMatch) {
        currentDate = line;
        continue;
    }

    // Look for open mic / jam events
    if (line.toLowerCase().includes('mic') || line.toLowerCase().includes('jam')) {
        const eventName = line;
        const timeLine = pitLines[i + 1]?.trim() || '';
        const venueLine = pitLines[i + 2]?.trim() || '';

        // Extract time (format: "4:30pm")
        const timeMatch = timeLine.match(/(\d{1,2}:\d{2}(?:am|pm)?)/i);

        if (eventName && timeMatch) {
            openMics.push({
                source: 'The PIT NYC',
                name: eventName,
                date: currentDate,
                time: timeMatch[1],
                venue: venueLine.includes('PIT') || venueLine.includes('Fishbowl') ? venueLine : 'The PIT NYC',
                address: '154 W 29th St, New York, NY 10001',
                link: 'https://thepit-nyc.com/calendar/',
                type: line.toLowerCase().includes('jam') ? 'jam' : 'open_mic'
            });
        }
    }
}

// ============================================
// EXTRACT FROM STAND UP NY
// ============================================
const standupEvents = data.sources.standUpNY?.events || [];
standupEvents.forEach(e => {
    const title = e.title?.toLowerCase() || '';
    if (title.includes('mic') || title.includes('open')) {
        openMics.push({
            source: 'Stand Up NY',
            name: e.title,
            date: e.date,
            time: e.time,
            venue: 'Stand Up NY',
            address: '236 W 78th St, New York, NY 10024',
            link: e.link || 'https://standupny.com/upcoming-shows/',
            type: 'open_mic'
        });
    }
});

// ============================================
// EXTRACT FROM COMEDY SHOP
// ============================================
const comedyShopText = data.sources.comedyShop?.rawText || '';
// Comedy Shop runs daily open mics - extract from text
if (comedyShopText.toLowerCase().includes('open mic') || comedyShopText.toLowerCase().includes('comedy')) {
    openMics.push({
        source: 'Comedy Shop NYC',
        name: 'Comedy Shop Open Mic',
        date: 'Daily',
        time: 'Multiple times',
        venue: 'The Comedy Shop',
        address: '167 Bleecker St, New York, NY 10012',
        link: 'https://comedyshopnyc.com/events/',
        type: 'open_mic',
        notes: 'Check website for daily schedule'
    });
}

// ============================================
// LAUGHING BUDDHA (Manual - they have many mics)
// ============================================
openMics.push({
    source: 'Laughing Buddha Comedy',
    name: 'Laughing Buddha Open Mics',
    date: 'Daily',
    time: 'Multiple venues/times',
    venue: 'Various NYC venues',
    address: 'Multiple locations',
    link: 'https://www.laughingbuddhacomedy.com/mics',
    type: 'open_mic',
    notes: 'Book through their website - $6-7, multiple venues daily'
});

// ============================================
// COMEDIANS ON THE LOOSE
// ============================================
const cotlText = data.sources.comediansOnTheLoose?.rawText || '';
openMics.push({
    source: 'Comedians on the Loose',
    name: 'COTL Open Mics',
    date: 'Check website',
    time: 'Various',
    venue: 'Various NYC venues',
    address: 'Multiple locations',
    link: 'https://www.comediansontheloose.com/open-mics',
    type: 'open_mic',
    notes: 'Multiple mics throughout the week'
});

// ============================================
// OUTPUT
// ============================================
console.log('\n🎤 EXTRACTED OPEN MICS\n');
console.log(`Found ${openMics.length} open mic events:\n`);

// Group by source
const bySource = {};
openMics.forEach(mic => {
    if (!bySource[mic.source]) bySource[mic.source] = [];
    bySource[mic.source].push(mic);
});

Object.entries(bySource).forEach(([source, mics]) => {
    console.log(`=== ${source} (${mics.length}) ===`);
    mics.forEach(m => {
        console.log(`  • ${m.name}`);
        console.log(`    ${m.date || ''} ${m.time || ''} @ ${m.venue}`);
    });
    console.log('');
});

// Save to file
fs.writeFileSync('scrapers/open-mics-extracted.json', JSON.stringify(openMics, null, 2));
console.log('💾 Saved to scrapers/open-mics-extracted.json');

// Also create a simple text list
const textList = openMics.map(m =>
    `${m.name} | ${m.source} | ${m.date} ${m.time} | ${m.link}`
).join('\n');
fs.writeFileSync('scrapers/open-mics-list.txt', textList);
console.log('📄 Saved to scrapers/open-mics-list.txt');
