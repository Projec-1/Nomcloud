import { chromium } from 'playwright';
import { existsSync } from 'fs';
import * as path from 'path';
import { readdirSync } from 'fs';

const BASE = 'http://localhost:5173';

function findEdgeExe() {
  const localAppData = process.env.LOCALAPPDATA || path.join('C:', 'Users', 'abdih', 'AppData', 'Local');
  const programFilesX86 = process.env.ProgramFilesX86 || path.join('C:', 'Program Files (x86)');
  if (existsSync(path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))) {
    return path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  }
  if (existsSync(path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))) {
    return path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  }
  const edgeAppDir = path.join(programFilesX86, 'Microsoft', 'Edge', 'Application');
  if (existsSync(edgeAppDir)) {
    const entries = readdirSync(edgeAppDir).filter((e) => /^\d+\.\d+\.\d+\.\d+$/.test(e)).sort().reverse();
    if (entries.length > 0) {
      const candidate = path.join(edgeAppDir, entries[0], 'msedge.exe');
      if (existsSync(candidate)) return candidate;
    }
  }
  console.error('No Edge executable found');
  process.exit(1);
}

const edgeExe = findEdgeExe();
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const profileDir = path.join(
  process.env.LOCALAPPDATA || path.join('C:', 'Users', 'abdih', 'AppData', 'Local'),
  'Microsoft',
  'Edge',
  'User Data',
  `NomCloud-Diag2-${ts}`
);

console.log('Profile dir:', profileDir);
console.log('Edge exe:', edgeExe);
console.log('Starting visible browser for manual sign-in...');

(async () => {
  const browser = await chromium.launchPersistentContext(profileDir, {
    executablePath: edgeExe,
    channel: 'msedge',
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: [
      '--remote-debugging-port=9297',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
    ],
  });

  const page = await browser.newPage();
  const timeline = [];
  page.on('console', (msg) => timeline.push({ t: 'console', type: msg.type(), text: msg.text().slice(0, 1000) }));
  page.on('pageerror', (err) => timeline.push({ t: 'pageerror', text: String(err).slice(0, 1000) }));
  page.on('requestfailed', (req) =>
    timeline.push({
      t: 'requestfailed',
      url: req.url().slice(0, 300),
      failure: req.failure()?.errorText?.slice(0, 300),
    })
  );
  page.on('response', (res) => {
    if (res.status() >= 400) {
      timeline.push({ t: 'response4xx+', status: res.status(), url: res.url().slice(0, 300) });
    }
  });

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('LOGIN_PAGE_REACHED:', page.url());
    console.log('LOGIN_PAGE_TITLE:', await page.title());
    console.log(
      "INSTRUCTIONS: Please sign in manually in the browser window. The script will wait for /platform."
    );
    console.log('TIMEOUT: 10 minutes.');

    let authComplete = false;
    try {
      await page.waitForURL(/\/platform/, { timeout: 600000 });
      authComplete = true;
    } catch (e) {
      console.error('AUTH_TIMEOUT_OR_ERROR:', e.message);
    }

    console.log('AFTER_AUTH_URL:', page.url());
    console.log('AFTER_AUTH_TITLE:', await page.title());
    if (!authComplete || !page.url().includes('/platform')) {
      console.log('BLOCKED: Could not reach authenticated platform. Stopping.');
      await browser.close();
      process.exit(0);
    }

    console.log('\n=== OPERATORS_DIAGNOSTIC ===');
    await page.goto(`${BASE}/operators`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const operatorsSnapshot1 = await page.textContent('body');
    console.log('OPERATORS_BODY_LEN_1:', operatorsSnapshot1.length);
    console.log('OPERATORS_HAS_LOADING_1:', operatorsSnapshot1.match(/loading|Loading/i) ? 'YES' : 'NO');
    console.log('OPERATORS_SNIPPET_1:', operatorsSnapshot1.slice(0, 800));
    console.log('OPERATORS_ERRORBANNERS_1:', await page.locator('.rounded-xl.bg-red, .rounded-xl.bg-red-500, [class*="red-500"][class*="bg"], .border-red-500.bg-red').count());
    const opBannerTexts1 = await page.locator('.rounded-xl.bg-red-500, [class*="bg-red-500/"].rounded').allTextContents();
    console.log('OPERATORS_BANNER_TEXTS_1:', JSON.stringify(opBannerTexts1.slice(0, 8)));

    console.log('\n=== OPERATORS_WAIT_MORE ===');
    await page.waitForTimeout(8000);
    const operatorsSnapshot2 = await page.textContent('body');
    console.log('OPERATORS_BODY_LEN_2:', operatorsSnapshot2.length);
    console.log('OPERATORS_HAS_LOADING_2:', operatorsSnapshot2.match(/loading|Loading/i) ? 'YES' : 'NO');
    console.log('OPERATORS_SNIPPET_2:', operatorsSnapshot2.slice(0, 800));
    const opBannerTexts2 = await page.locator('.rounded-xl.bg-red-500, [class*="bg-red-500/"].rounded').allTextContents();
    console.log('OPERATORS_BANNER_TEXTS_2:', JSON.stringify(opBannerTexts2.slice(0, 8)));

    console.log('\n=== BACKUPS_DIAGNOSTIC ===');
    await page.goto(`${BASE}/backups`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const backupsSnapshot1 = await page.textContent('body');
    console.log('BACKUPS_BODY_LEN_1:', backupsSnapshot1.length);
    console.log('BACKUPS_SNIPPET_1:', backupsSnapshot1.slice(0, 800));
    const bannerMatches = await page.locator('.rounded-xl.bg-red, .rounded-xl.bg-red-500, [class*="red-500"][class*="bg"], .border-red-500.bg-red').count();
    console.log('BACKUPS_BANNER_MATCHES:', bannerMatches);
    const bannerTexts = await page.locator('.rounded-xl.bg-red-500, [class*="bg-red-500/"].rounded').allTextContents();
    console.log('BACKUPS_BANNER_TEXTS_RAW:', JSON.stringify(bannerTexts.slice(0, 8)));
    console.log('BACKUPS_BANNER_TEXTS_NONEMPTY:', JSON.stringify(bannerTexts.filter((t) => t.trim().length > 0).slice(0, 8)));

    console.log('\n=== TIMELINE_FILTERED ===');
    console.log('CONSOLE_ERRORS:', JSON.stringify(timeline.filter((m) => m.t === 'console' && m.type === 'error').slice(0, 10)));
    console.log('PAGE_ERRORS:', JSON.stringify(timeline.filter((m) => m.t === 'pageerror').slice(0, 10)));
    console.log('REQUEST_FAILED:', JSON.stringify(timeline.filter((m) => m.t === 'requestfailed').slice(0, 10)));
    console.log('RESPONSE_4XX_PLUS:', JSON.stringify(timeline.filter((m) => m.t === 'response4xx+').slice(0, 10)));

    console.log('\n=== DIAGNOSTIC_COMPLETE ===');
    console.log('BROWSER_LEFT_OPEN_FOR_INSPECTION');
  } catch (e) {
    console.error('PLAYWRIGHT_FATAL:', e.message);
    await browser.close();
    process.exit(1);
  }
})().catch((e) => {
  console.error('PLAYWRIGHT_FATAL:', e.message);
  process.exit(1);
});
