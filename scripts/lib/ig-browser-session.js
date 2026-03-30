const DEFAULT_VIEWPORT = { width: 1280, height: 900 };

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectToRemoteBrowser(puppeteer, remoteDebugUrl) {
  if (!remoteDebugUrl) {
    throw new Error(
      'Chrome remote debugging URL is required.\n' +
      'Pass --remote-debug-url or set CHROME_REMOTE_DEBUG_URL.'
    );
  }

  try {
    const response = await fetch(remoteDebugUrl);
    const info = await response.json();
    return await puppeteer.connect({
      browserWSEndpoint: info.webSocketDebuggerUrl,
      defaultViewport: null
    });
  } catch {
    throw new Error(
      'Could not connect to Chrome remote debugging.\n' +
      `Expected DevTools JSON at: ${remoteDebugUrl}\n` +
      'Start Chrome with remote debugging enabled and re-run this script.'
    );
  }
}

async function createWorkerPage(browser, viewport = DEFAULT_VIEWPORT) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  return page;
}

async function dismissCommonPopups(page) {
  let dismissed = true;
  while (dismissed) {
    dismissed = await page.evaluate(() => {
      for (const el of document.querySelectorAll('button, div[role="button"]')) {
        const text = (el.textContent || '').trim().toLowerCase();
        if (/^(not now|cancel|dismiss|ok|allow essential and optional cookies|allow all cookies)$/.test(text)) {
          el.click();
          return true;
        }
      }

      return false;
    });

    if (dismissed) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

async function isInstagramLoggedIn(page) {
  await page.goto('https://www.instagram.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await sleep(2000);
  await dismissCommonPopups(page);

  const state = await page.evaluate(() => {
    const url = window.location.href;
    const bodyText = normalizeSpace(document.body?.innerText || '');
    const hasLoginForm = !!document.querySelector('input[name="username"], input[name="password"]');
    const loginCopy = /\blog in\b/i.test(bodyText) && /\bsign up\b/i.test(bodyText);
    const searchBar = !!document.querySelector('input[placeholder="Search"], input[aria-label="Search input"]');

    return {
      url,
      hasLoginForm,
      loginCopy,
      searchBar
    };

    function normalizeSpace(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }
  });

  if (state.url.includes('/accounts/login')) return false;
  if (state.hasLoginForm) return false;
  if (state.loginCopy && !state.searchBar) return false;
  return true;
}

async function ensureInstagramLoggedIn(browser, viewport = DEFAULT_VIEWPORT) {
  const page = await createWorkerPage(browser, viewport);
  try {
    const ok = await isInstagramLoggedIn(page);
    if (!ok) {
      throw new Error('Not logged into Instagram in the connected Chrome session.');
    }
  } finally {
    await page.close();
  }
}

module.exports = {
  DEFAULT_VIEWPORT,
  connectToRemoteBrowser,
  createWorkerPage,
  dismissCommonPopups,
  ensureInstagramLoggedIn,
  isInstagramLoggedIn,
  normalizeSpace,
  sleep
};
