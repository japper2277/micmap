const puppeteer = require('puppeteer');

async function scrapeSlotted(url) {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for Cloudflare challenge to complete
    console.log('Waiting for page to load...');
    await page.waitForFunction(() => {
        return !document.title.includes('moment') && !document.title.includes('Just a');
    }, { timeout: 30000 }).catch(() => {
        console.log('Cloudflare challenge may still be active');
    });

    // Extra wait for content to render
    await new Promise(r => setTimeout(r, 3000));

    // Get page title to verify we're past Cloudflare
    const title = await page.title();
    console.log(`Page title: ${title}`);

    // Get the full HTML for debugging
    const html = await page.content();
    console.log(`\nPage HTML length: ${html.length} chars\n`);

    // Try to extract event data
    const data = await page.evaluate(() => {
        const results = {
            title: document.title,
            events: [],
            rawText: document.body?.innerText?.slice(0, 2000) || 'No body text'
        };

        // Look for common event patterns
        // Slotted often uses cards or list items for time slots
        const timeSlots = document.querySelectorAll('[class*="slot"], [class*="event"], [class*="time"], [class*="card"]');
        timeSlots.forEach(slot => {
            results.events.push({
                text: slot.innerText?.slice(0, 200),
                classes: slot.className
            });
        });

        // Also grab any tables
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
            results.events.push({
                type: 'table',
                text: table.innerText?.slice(0, 500)
            });
        });

        return results;
    });

    console.log('=== EXTRACTED DATA ===');
    console.log('Title:', data.title);
    console.log('\n--- Raw Text Preview ---');
    console.log(data.rawText);
    console.log('\n--- Found Elements ---');
    data.events.slice(0, 10).forEach((e, i) => {
        console.log(`\n[${i}] ${e.classes || e.type || 'unknown'}`);
        console.log(e.text);
    });

    // Save screenshot for debugging
    await page.screenshot({ path: 'scrapers/slotted-screenshot.png', fullPage: true });
    console.log('\nScreenshot saved to scrapers/slotted-screenshot.png');

    await browser.close();
    return data;
}

// Run it
scrapeSlotted('https://slotted.co/seshopenmics')
    .then(() => console.log('\nDone!'))
    .catch(err => console.error('Error:', err));
