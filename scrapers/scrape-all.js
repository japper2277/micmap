const puppeteer = require('puppeteer');
const fs = require('fs');

// ============================================
// NYC COMEDY OPEN MIC SCRAPER
// Scrapes: Comedy Shop, Stand Up NY, The PIT,
//          Laughing Buddha, Comedians on the Loose
// ============================================

async function scrapeAll() {
    console.log('🎤 NYC Open Mic Scraper Starting...\n');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const results = {
        scrapedAt: new Date().toISOString(),
        sources: {}
    };

    // 1. COMEDY SHOP NYC
    console.log('📍 [1/5] Comedy Shop NYC...');
    try {
        results.sources.comedyShop = await scrapeComedyShop(browser);
        console.log(`   ✅ Found ${results.sources.comedyShop.events?.length || 0} events\n`);
    } catch (err) {
        console.log(`   ❌ Error: ${err.message}\n`);
        results.sources.comedyShop = { error: err.message };
    }

    // 2. STAND UP NY
    console.log('📍 [2/5] Stand Up NY...');
    try {
        results.sources.standUpNY = await scrapeStandUpNY(browser);
        console.log(`   ✅ Found ${results.sources.standUpNY.events?.length || 0} events\n`);
    } catch (err) {
        console.log(`   ❌ Error: ${err.message}\n`);
        results.sources.standUpNY = { error: err.message };
    }

    // 3. THE PIT NYC
    console.log('📍 [3/5] The PIT NYC...');
    try {
        results.sources.thePit = await scrapeThePit(browser);
        console.log(`   ✅ Found ${results.sources.thePit.events?.length || 0} events\n`);
    } catch (err) {
        console.log(`   ❌ Error: ${err.message}\n`);
        results.sources.thePit = { error: err.message };
    }

    // 4. LAUGHING BUDDHA
    console.log('📍 [4/5] Laughing Buddha...');
    try {
        results.sources.laughingBuddha = await scrapeLaughingBuddha(browser);
        console.log(`   ✅ Found ${results.sources.laughingBuddha.events?.length || 0} events\n`);
    } catch (err) {
        console.log(`   ❌ Error: ${err.message}\n`);
        results.sources.laughingBuddha = { error: err.message };
    }

    // 5. COMEDIANS ON THE LOOSE
    console.log('📍 [5/5] Comedians on the Loose...');
    try {
        results.sources.comediansOnTheLoose = await scrapeComediansOnTheLoose(browser);
        console.log(`   ✅ Found ${results.sources.comediansOnTheLoose.events?.length || 0} events\n`);
    } catch (err) {
        console.log(`   ❌ Error: ${err.message}\n`);
        results.sources.comediansOnTheLoose = { error: err.message };
    }

    await browser.close();

    // Save results
    const outputPath = 'scrapers/scraped-mics.json';
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to ${outputPath}`);

    // Summary
    console.log('\n📊 SUMMARY:');
    Object.entries(results.sources).forEach(([name, data]) => {
        const count = data.events?.length || 0;
        const status = data.error ? '❌' : '✅';
        console.log(`   ${status} ${name}: ${data.error || count + ' events'}`);
    });

    return results;
}

// ============================================
// 1. COMEDY SHOP NYC
// ============================================
async function scrapeComedyShop(browser) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    await page.goto('https://comedyshopnyc.com/events/', {
        waitUntil: 'networkidle2',
        timeout: 30000
    });

    await page.waitForSelector('body', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 2000));

    const data = await page.evaluate(() => {
        const events = [];

        // Look for event containers
        const eventElements = document.querySelectorAll('[class*="event"], .show, .performance, article');

        eventElements.forEach(el => {
            const title = el.querySelector('h2, h3, .title, [class*="title"]')?.innerText?.trim();
            const time = el.querySelector('[class*="time"], time, .date')?.innerText?.trim();
            const link = el.querySelector('a')?.href;

            if (title && title.length > 2) {
                events.push({ title, time, link });
            }
        });

        // Also grab any text that looks like event info
        const bodyText = document.body.innerText;

        return {
            url: window.location.href,
            pageTitle: document.title,
            events,
            rawText: bodyText.slice(0, 3000)
        };
    });

    await page.close();
    return data;
}

// ============================================
// 2. STAND UP NY (VenuePilot)
// ============================================
async function scrapeStandUpNY(browser) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    await page.goto('https://standupny.com/upcoming-shows/', {
        waitUntil: 'networkidle2',
        timeout: 30000
    });

    // Wait for VenuePilot to load
    await new Promise(r => setTimeout(r, 3000));

    const data = await page.evaluate(() => {
        const events = [];

        // VenuePilot typically renders events in grid/list format
        const eventElements = document.querySelectorAll('[class*="event"], [class*="show"], .vp-event, article');

        eventElements.forEach(el => {
            const title = el.querySelector('h2, h3, h4, .title, [class*="title"], [class*="name"]')?.innerText?.trim();
            const date = el.querySelector('[class*="date"], time, .when')?.innerText?.trim();
            const time = el.querySelector('[class*="time"]')?.innerText?.trim();
            const link = el.querySelector('a')?.href;
            const price = el.querySelector('[class*="price"]')?.innerText?.trim();

            if (title && title.length > 2) {
                events.push({ title, date, time, price, link });
            }
        });

        return {
            url: window.location.href,
            pageTitle: document.title,
            events,
            rawText: document.body.innerText.slice(0, 3000)
        };
    });

    await page.close();
    return data;
}

// ============================================
// 3. THE PIT NYC
// ============================================
async function scrapeThePit(browser) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    // Try the calendar page for better structure
    await page.goto('https://thepit-nyc.com/calendar/', {
        waitUntil: 'networkidle2',
        timeout: 30000
    });

    await new Promise(r => setTimeout(r, 2000));

    const data = await page.evaluate(() => {
        const events = [];

        // Look for event/show elements
        const eventElements = document.querySelectorAll('[class*="event"], [class*="show"], article, .performance, tr');

        eventElements.forEach(el => {
            const title = el.querySelector('h2, h3, h4, .title, [class*="title"], a')?.innerText?.trim();
            const date = el.querySelector('[class*="date"], time, td:first-child')?.innerText?.trim();
            const time = el.querySelector('[class*="time"]')?.innerText?.trim();
            const link = el.querySelector('a')?.href;
            const venue = el.querySelector('[class*="venue"], [class*="location"]')?.innerText?.trim();

            if (title && title.length > 2 && !title.includes('Buy') && !title.includes('Click')) {
                events.push({ title, date, time, venue, link });
            }
        });

        return {
            url: window.location.href,
            pageTitle: document.title,
            events,
            rawText: document.body.innerText.slice(0, 3000)
        };
    });

    await page.close();
    return data;
}

// ============================================
// 4. LAUGHING BUDDHA (Squarespace)
// ============================================
async function scrapeLaughingBuddha(browser) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    await page.goto('https://www.laughingbuddhacomedy.com/mics', {
        waitUntil: 'networkidle2',
        timeout: 30000
    });

    // Squarespace needs time to render
    await new Promise(r => setTimeout(r, 3000));

    const data = await page.evaluate(() => {
        const events = [];

        // Squarespace gallery/collection items
        const eventElements = document.querySelectorAll('[class*="gallery"], [class*="collection"], [class*="item"], article, .event');

        eventElements.forEach(el => {
            const title = el.querySelector('h2, h3, h4, .title, [class*="title"], img')?.innerText?.trim()
                         || el.querySelector('img')?.alt;
            const date = el.querySelector('[class*="date"], time')?.innerText?.trim();
            const link = el.querySelector('a')?.href;
            const desc = el.querySelector('p, [class*="desc"]')?.innerText?.trim();

            if (title && title.length > 2) {
                events.push({ title, date, link, description: desc });
            }
        });

        // Also look for any schedule/calendar text
        const scheduleText = document.body.innerText;

        return {
            url: window.location.href,
            pageTitle: document.title,
            events,
            rawText: scheduleText.slice(0, 3000)
        };
    });

    await page.close();
    return data;
}

// ============================================
// 5. COMEDIANS ON THE LOOSE (Wix)
// ============================================
async function scrapeComediansOnTheLoose(browser) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    await page.goto('https://www.comediansontheloose.com/open-mics', {
        waitUntil: 'networkidle2',
        timeout: 30000
    });

    // Wix sites are heavy - need extra wait time
    await new Promise(r => setTimeout(r, 5000));

    const data = await page.evaluate(() => {
        const events = [];

        // Wix uses various container types
        const eventElements = document.querySelectorAll('[data-hook*="event"], [class*="event"], [class*="item"], article, section');

        eventElements.forEach(el => {
            const title = el.querySelector('h2, h3, h4, [class*="title"], [data-hook*="title"]')?.innerText?.trim();
            const date = el.querySelector('[class*="date"], [data-hook*="date"], time')?.innerText?.trim();
            const time = el.querySelector('[class*="time"], [data-hook*="time"]')?.innerText?.trim();
            const link = el.querySelector('a')?.href;
            const location = el.querySelector('[class*="location"], [class*="venue"]')?.innerText?.trim();

            if (title && title.length > 2 && title.length < 200) {
                events.push({ title, date, time, location, link });
            }
        });

        return {
            url: window.location.href,
            pageTitle: document.title,
            events,
            rawText: document.body.innerText.slice(0, 3000)
        };
    });

    await page.close();
    return data;
}

// Run it
scrapeAll()
    .then(() => console.log('\n✨ Done!'))
    .catch(err => console.error('Fatal error:', err));
