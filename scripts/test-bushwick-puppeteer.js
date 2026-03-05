#!/usr/bin/env node
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  const urls = [
    // Friday - available (11 spots from your screenshot)
    'https://www.bushwickcomedy.com/event-details/friday-night-open-mic-6-30pm-2026-03-06-18-30',
    // Thursday - sold out
    'https://www.bushwickcomedy.com/event-details/thursday-night-open-mic-6-30pm-2026-03-05',
  ];

  for (const url of urls) {
    console.log('\n========================================');
    console.log('URL:', url);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));

    // Click the quantity dropdown to open it, then read all options
    const result = await page.evaluate(() => {
      // Find the quantity picker
      const picker = document.querySelector('[data-hook="quantity-picker"]');
      if (!picker) return { error: 'No quantity-picker found' };

      // Get the dropdown trigger and click it to expand
      const trigger = picker.querySelector('[data-hook="dropdown-base"]') || picker;
      trigger.click();

      return { found: true, pickerHTML: picker.innerHTML.slice(0, 500) };
    });

    if (result.error) {
      console.log('ERROR:', result.error);
      continue;
    }

    // Wait for dropdown to open
    await new Promise(r => setTimeout(r, 1000));

    // Now read all the dropdown options
    const options = await page.evaluate(() => {
      // Look for all option elements in the dropdown
      const optionEls = document.querySelectorAll('[data-hook="dropdown-item"]');
      if (optionEls.length > 0) {
        return {
          source: 'dropdown-item',
          values: [...optionEls].map(el => el.textContent.trim())
        };
      }

      // Fallback: look for role="option" or role="listbox" items
      const roleOpts = document.querySelectorAll('[role="option"], [role="listbox"] > *');
      if (roleOpts.length > 0) {
        return {
          source: 'role-option',
          values: [...roleOpts].map(el => el.textContent.trim())
        };
      }

      // Fallback: look inside quantity-picker for any list items
      const picker = document.querySelector('[data-hook="quantity-picker"]');
      if (picker) {
        const items = picker.querySelectorAll('li, div[class*="option"], div[class*="item"]');
        return {
          source: 'picker-items',
          values: [...items].map(el => el.textContent.trim()).filter(t => /^\d+$/.test(t))
        };
      }

      return { source: 'none', values: [] };
    });

    console.log('Dropdown source:', options.source);
    console.log('Options:', options.values);

    const nums = options.values.map(v => parseInt(v)).filter(n => !isNaN(n));
    const maxQty = nums.length > 0 ? Math.max(...nums) : 0;
    console.log('Max quantity (= spots left):', maxQty);

    // Get event title/date too
    const eventInfo = await page.evaluate(() => {
      const title = document.querySelector('[data-hook="event-title"]')?.textContent?.trim() || '';
      const date = document.querySelector('[data-hook="event-full-date"]')?.textContent?.trim() || '';
      return { title, date };
    });
    console.log('Event:', eventInfo.title);
    console.log('Date:', eventInfo.date);
  }

  await browser.close();
  console.log('\nDone!');
})();
