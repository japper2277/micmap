const fs = require('fs');
const path = require('path');

const { createWorkerPage, dismissCommonPopups, sleep } = require('./ig-browser-session');

async function captureRecentPostsFallback(browser, handle, diagnosticsDir, limit = 3) {
  const page = await createWorkerPage(browser);

  try {
    await page.goto(`https://www.instagram.com/${handle}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await sleep(2500);
    await dismissCommonPopups(page);

    const postLinks = await page.evaluate((max) => {
      const links = Array.from(document.querySelectorAll('a[href*="/p/"]'))
        .map((node) => node.href)
        .filter(Boolean);
      return [...new Set(links)].slice(0, max);
    }, limit);

    const captures = [];
    for (let index = 0; index < postLinks.length; index += 1) {
      const postUrl = postLinks[index];
      await page.goto(postUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await sleep(2000);

      const screenshotPath = path.join(diagnosticsDir, `ig-post-${handle}-${index}.png`);
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: false });

      captures.push({
        source: 'post',
        postUrl,
        screenshotPath
      });
    }

    return captures;
  } finally {
    await page.close();
  }
}

module.exports = {
  captureRecentPostsFallback
};
