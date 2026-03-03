const fs = require('fs');
const path = require('path');

// Regex for URLs
const urlRegex = /https?:\/\/[^\s"',]+|www\.[^\s"',]+/ig;

async function checkUrl(url) {
    if (url.startsWith('www.')) url = 'https://' + url;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        
        const response = await fetch(url, { 
            method: 'GET', // Some sites block HEAD
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        clearTimeout(timeoutId);
        
        return { url, status: response.status, ok: response.ok };
    } catch (error) {
        return { url, status: 'ERROR', error: error.message };
    }
}

async function run() {
    console.log("Loading mics.json...");
    const dataPath = path.join(__dirname, '../mics.json');
    const mics = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    const uniqueUrls = new Set();
    const urlSources = {}; // Maps URL to an array of mic names

    mics.forEach(mic => {
        const textToSearch = [mic.signUpDetails, mic.notes, mic.host].filter(Boolean).join(' ');
        let match;
        while ((match = urlRegex.exec(textToSearch)) !== null) {
            let u = match[0];
            // cleanup trailing punctuation
            if (u.endsWith('.') || u.endsWith(')')) u = u.slice(0, -1);
            uniqueUrls.add(u);
            if (!urlSources[u]) urlSources[u] = new Set();
            urlSources[u].add(mic.venueName || mic.name);
        }
    });

    console.log(`Found ${uniqueUrls.size} unique URLs. Starting verification...`);
    
    const results = [];
    const urlsArray = Array.from(uniqueUrls);
    
    // Process in batches
    const BATCH_SIZE = 5;
    for (let i = 0; i < urlsArray.length; i += BATCH_SIZE) {
        const batch = urlsArray.slice(i, i + BATCH_SIZE);
        process.stdout.write(`Processing ${i + 1} to ${Math.min(i + BATCH_SIZE, urlsArray.length)}...\r`);
        const batchResults = await Promise.all(batch.map(u => checkUrl(u)));
        results.push(...batchResults);
    }
    console.log('\nDone verifying.');

    const broken = results.filter(r => !r.ok);
    const valid = results.filter(r => r.ok);
    
    console.log(`\n--- RESULTS ---`);
    console.log(`Total URLs: ${results.length}`);
    console.log(`Valid (200 OK): ${valid.length}`);
    console.log(`Broken/Errors: ${broken.length}`);
    
    if (broken.length > 0) {
        console.log(`\n--- BROKEN LINKS ---`);
        broken.forEach(b => {
            const venues = Array.from(urlSources[b.url] || []).join(', ');
            console.log(`[${b.status}] ${b.url}`);
            if (b.error) console.log(`      Error: ${b.error}`);
            console.log(`      Found in: ${venues}`);
        });
    }

    // Write report
    const reportPath = path.join(__dirname, '../../link_audit_report.md');
    let md = `# Automated Link Audit Report\n\n`;
    md += `**Total URLs found in mics.json:** ${results.length}\n`;
    md += `**Valid URLs:** ${valid.length}\n`;
    md += `**Broken/Error URLs:** ${broken.length}\n\n`;
    
    if (broken.length > 0) {
        md += `## Broken Links\n`;
        md += `| URL | Status/Error | Found In Venues |\n`;
        md += `|---|---|---|\n`;
        broken.forEach(b => {
            const venues = Array.from(urlSources[b.url] || []).join(', ');
            const status = b.error ? `Error: ${b.error}` : `HTTP ${b.status}`;
            md += `| ${b.url} | ${status} | ${venues} |\n`;
        });
    }
    
    md += `\n## Valid Links\n`;
    valid.forEach(v => {
        md += `- ${v.url}\n`;
    });

    fs.writeFileSync(reportPath, md);
    console.log(`\nFull report saved to link_audit_report.md`);
}

run();
