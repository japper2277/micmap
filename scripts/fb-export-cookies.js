#!/usr/bin/env node
/**
 * Connects to Chrome (remote debugging port 9222), extracts Facebook cookies,
 * and outputs them for use as a GitHub secret.
 *
 * Usage:
 *   node scripts/fb-export-cookies.js              # saves to logs/fb-cookies-export.json
 *   node scripts/fb-export-cookies.js --set-secret  # sets GitHub secret via gh CLI
 */

const puppeteer = require('puppeteer');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
      '--remote-debugging-port=9222 --user-data-dir="logs/fb-chrome-profile"\n' +
      'And that you are logged into Facebook.'
    );
    process.exit(1);
  }

  const page = await browser.newPage();
  await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });

  const cookies = await page.cookies('https://www.facebook.com');
  browser.disconnect();

  const fbCookies = cookies.filter((c) =>
    c.domain.includes('facebook.com') || c.domain.includes('.facebook.com')
  );

  if (fbCookies.length === 0) {
    console.error('No Facebook cookies found. Are you logged in?');
    process.exit(1);
  }

  const json = JSON.stringify(fbCookies);
  const b64 = Buffer.from(json).toString('base64');

  if (setSecret) {
    try {
      execSync(`echo '${b64}' | gh secret set FB_COOKIES`, {
        stdio: 'inherit'
      });
      console.log(`\nSet FB_COOKIES secret (${fbCookies.length} cookies, base64 encoded)`);
    } catch (err) {
      console.error('Failed to set secret via gh CLI. Make sure gh is installed and authenticated.');
      console.error('You can manually set it: gh secret set FB_COOKIES');
      // Fall back to saving to file
      const outPath = path.join(__dirname, '../logs/fb-cookies-export.json');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, json);
      console.log(`Cookies saved to ${outPath} — paste into GitHub secret manually.`);
    }
  } else {
    const outPath = path.join(__dirname, '../logs/fb-cookies.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, json);
    console.log(`Saved ${fbCookies.length} Facebook cookies to ${outPath}`);
    console.log('To set as GitHub secret: node scripts/fb-export-cookies.js --set-secret');
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
