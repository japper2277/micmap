#!/usr/bin/env node
/**
 * Opens Instagram in a Puppeteer browser so you can log in manually.
 * Once logged in, press Enter in the terminal to save cookies and exit.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const readline = require('readline');

const COOKIES_PATH = path.join(__dirname, '../logs/ig-cookies.json');

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 390, height: 844 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  );

  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('\n==> Browser is open. Log in to Instagram manually.');
  console.log('==> When you are fully logged in (see your feed), press ENTER here to save cookies.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question('', resolve));
  rl.close();

  const cookies = await page.cookies();
  fs.mkdirSync(path.dirname(COOKIES_PATH), { recursive: true });
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  console.log(`Cookies saved to ${COOKIES_PATH} (${cookies.length} cookies)`);

  await browser.close();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
