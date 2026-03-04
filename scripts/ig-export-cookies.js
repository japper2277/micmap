#!/usr/bin/env node
/**
 * Connects to Chrome (remote debugging port 9222), extracts Instagram cookies,
 * and outputs them for use as a GitHub secret.
 *
 * Usage:
 *   node scripts/ig-export-cookies.js              # prints JSON
 *   node scripts/ig-export-cookies.js --set-secret  # sets GitHub secret via gh CLI
 */

const puppeteer = require('puppeteer');
const { execSync } = require('child_process');

const REMOTE_PORT = 9222;

async function main() {
  const setSecret = process.argv.includes('--set-secret');

  let browser;
  try {
    const resp = await fetch(`http://127.0.0.1:${REMOTE_PORT}/json/version`);
    const info = await resp.json();
    browser = await puppeteer.connect({
      browserWSEndpoint: info.webSocketDebuggerUrl,
      defaultViewport: null
    });
  } catch {
    console.error(
      'Could not connect to Chrome. Make sure Chrome is running with:\n' +
      '  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome ' +
      '--remote-debugging-port=9222 --user-data-dir="logs/ig-chrome-profile"\n' +
      'And that you are logged into Instagram.'
    );
    process.exit(1);
  }

  const page = await browser.newPage();
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 30000 });

  const cookies = await page.cookies('https://www.instagram.com');
  browser.disconnect();

  // Filter to only IG-relevant cookies
  const igCookies = cookies.filter((c) =>
    c.domain.includes('instagram.com') || c.domain.includes('.instagram.com')
  );

  if (igCookies.length === 0) {
    console.error('No Instagram cookies found. Are you logged in?');
    process.exit(1);
  }

  const json = JSON.stringify(igCookies);

  if (setSecret) {
    try {
      execSync(`echo '${json.replace(/'/g, "'\\''")}' | gh secret set IG_COOKIES`, {
        stdio: 'inherit'
      });
      console.log(`\nSet IG_COOKIES secret (${igCookies.length} cookies)`);
    } catch (err) {
      console.error('Failed to set secret via gh CLI. Make sure gh is installed and authenticated.');
      console.error('You can manually set it: gh secret set IG_COOKIES < cookies.json');
      // Fall back to printing
      const fs = require('fs');
      const outPath = require('path').join(__dirname, '../logs/ig-cookies-export.json');
      fs.writeFileSync(outPath, json);
      console.log(`Cookies saved to ${outPath} — paste into GitHub secret manually.`);
    }
  } else {
    console.log(json);
    console.log(`\n# ${igCookies.length} Instagram cookies exported`);
    console.log('# To set as GitHub secret: node scripts/ig-export-cookies.js --set-secret');
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
