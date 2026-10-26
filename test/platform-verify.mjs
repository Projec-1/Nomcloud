import { chromium } from 'playwright';
import { existsSync } from 'fs';
import * as path from 'path';
import { readdirSync } from 'fs';

const BASE = 'http://localhost:5173';

const PLATFORM_SECTIONS = [
  { label: 'Overview', path: '/platform' },
  { label: 'Action Center', path: '/platform/actions' },
  { label: 'Requests & Reviews', path: '/platform/requests' },
  { label: 'Audit Logs', path: '/platform/audit' },
  { label: 'Operators', path: '/platform/operators' },
  { label: 'People', path: '/platform/people' },
  { label: 'Permissions', path: '/platform/permissions' },
  { label: 'Settings', path: '/platform/settings' },
  { label: 'Activity', path: '/platform/activity' },
  { label: 'Analytics', path: '/platform/analytics' },
  { label: 'Billing', path: '/platform/billing' },
  { label: 'Communications', path: '/platform/communications' },
  { label: 'Integrations', path: '/platform/integrations' },
  { label: 'Security', path: '/platform/security' },
  { label: 'System Health', path: '/platform/health' },
  { label: 'Backups & Recovery', path: '/platform/backups' },
  { label: 'Maintenance', path: '/platform/maintenance' },
  { label: 'Data', path: '/platform/data' },
  { label: 'Features', path: '/platform/features' },
];

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
  `NomCloud-TestProfile-${ts}`
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
      '--remote-debugging-port=9299',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
    ],
  });

  const page = await browser.newPage();
  const allConsole = [];
  page.on('console', (msg) => allConsole.push([msg.type(), msg.text().slice(0, 500)]));
  const allRequests = [];
  page.on('requestfailed', (req) =>
    allRequests.push({ failed: true, url: req.url().slice(0, 300), failure: req.failure()?.errorText?.slice(0, 200) })
  );
  page.on('response', (res) => {
    if (res.status() >= 400) {
      allRequests.push({ failed: false, status: res.status(), url: res.url().slice(0, 300) });
    }
  });

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('LOGIN_PAGE_REACHED:', page.url());
    console.log('LOGIN_PAGE_TITLE:', await page.title());
    console.log(
      "INSTRUCTIONS: Please sign in manually in the browser window. The test will wait for the URL to change to /platform."
    );
    console.log('TIMEOUT: 10 minutes. If sign-in takes longer, the test will report the current state and stop.');

    let authComplete = false;
    try {
      await page.waitForURL(/\/platform/, { timeout: 600000 });
      authComplete = true;
    } catch (e) {
      console.error('AUTH_TIMEOUT_OR_ERROR:', e.message);
    }

    console.log('AFTER_AUTH_URL:', page.url());
    console.log('AFTER_AUTH_TITLE:', await page.title());
    const afterAuthBody = await page.textContent('body');
    console.log('AFTER_AUTH_BODY_LEN:', afterAuthBody.length);
    console.log('AFTER_AUTH_SNIPPET:', afterAuthBody.slice(0, 500));
    console.log('AUTH_COMPLETE:', authComplete);

    if (!authComplete || !page.url().includes('/platform')) {
      console.log('BLOCKED: Could not reach authenticated platform. Stopping.');
      await browser.close();
      process.exit(0);
    }

    console.log('\n=== OVERVIEW VERIFICATION ===');
    await page.waitForTimeout(3000);
    const overviewBody = await page.textContent('body');
    console.log('OVERVIEW_BODY_LEN:', overviewBody.length);
    console.log('OVERVIEW_SNIPPET:', overviewBody.slice(0, 800));
    console.log('HAS_OBJECT_ERROR:', overviewBody.includes('[object Object]'));
    console.log('HAS_RED_ERROR_BANNER:', overviewBody.match(/could not load|error|unavailable/i) ? 'POSSIBLE' : 'NONE_VISIBLE');

    const results = [];
    for (const section of PLATFORM_SECTIONS) {
      try {
        const sectionResult = await testSection(page, section, BASE, allConsole.slice(), allRequests.slice());
        results.push(sectionResult);
        allConsole.length = 0;
        allRequests.length = 0;
        page.on('console', (msg) => allConsole.push([msg.type(), msg.text().slice(0, 500)]));
        page.on('requestfailed', (req) =>
          allRequests.push({ failed: true, url: req.url().slice(0, 300), failure: req.failure()?.errorText?.slice(0, 200) })
        );
        page.on('response', (res) => {
          if (res.status() >= 400) {
            allRequests.push({ failed: false, status: res.status(), url: res.url().slice(0, 300) });
          }
        });
      } catch (e) {
        results.push({
          section: section.label,
          path: section.path,
          status: 'ERROR',
          error: String(e.message).slice(0, 300),
          evidence: null,
        });
      }
    }

    console.log('\n=== FINAL CONSOLE ERRORS ===');
    console.log('CONSOLE_ERRORS:', JSON.stringify(allConsole.filter((m) => m[0] === 'error').slice(0, 10)));
    console.log('\n=== ALL RESULTS ===');
    console.log('ALL_RESULTS:', JSON.stringify(results, null, 2));
    console.log('\n=== TEST_COMPLETE ===');

    console.log('BROWSER_LEFT_OPEN_FOR_INSPECTION');
  } catch (e) {
    console.error('PLAYWRIGHT_FATAL:', e.message);
    await browser.close();
    process.exit(1);
  }
})();

async function testSection(page, section, base, capturedConsole, capturedRequests) {
  await page.goto(`${base}${section.path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const url = page.url();
  const title = await page.title();
  const bodyText = await page.textContent('body');
  const navPresent = await page.locator('nav[aria-label*="navigation"], nav, .nav, [class*="nav"]').count();
  const sidebarPresent = await page.locator('aside').count();
  const headerPresent = await page.locator('header').count();

  const errorBanners = await page.locator('.rounded-xl.bg-red, .rounded-xl.bg-red-500, [class*="red-500"][class*="bg"], .border-red-500.bg-red').count();
  const errorBannerTexts = await page.locator('.rounded-xl.bg-red-500, [class*="bg-red-500/"].rounded').allTextContents();

  const loadingText = bodyText?.match(/loading|Loading/i)?.[0] || null;
  const hasObjectError = bodyText?.includes('[object Object]') || false;
  const isBlank = !bodyText || bodyText.trim().length < 50;
  const numbers = (bodyText || '').match(/\b\d{1,3}(?:,\d{3})*\b/g) || [];

  return {
    section: section.label,
    path: section.path,
    navigatedTo: url,
    title,
    status: determineStatus({
      isBlank,
      hasObjectError,
      errorBanners,
      errorBannerTexts,
      loadingText,
      bodyText,
      url,
      sectionPath: section.path,
    }),
    evidence: {
      bodyLength: bodyText?.length,
      bodySnippet: bodyText?.slice(0, 300),
      numbersFound: numbers.slice(0, 8),
      errorBanners,
      errorBannerTexts: errorBannerTexts.slice(0, 3),
      loadingState: loadingText,
      consoleErrors: capturedConsole.filter((m) => m[0] === 'error').slice(0, 5),
      failedRequests: capturedRequests.slice(0, 5),
      layout: {
        navPresent,
        sidebarPresent,
        headerPresent,
      },
    },
  };
}

function determineStatus({ isBlank, hasObjectError, errorBanners, errorBannerTexts, loadingText, bodyText, url, sectionPath }) {
  if (!url.includes(sectionPath) && !url.includes(`${BASE}${sectionPath}`)) {
    return 'BLOCKED_REDIRECT';
  }

  if (isBlank) {
    return 'FAIL_BLANK';
  }

  if (hasObjectError) {
    return 'FAIL_OBJECT_ERROR';
  }

  if (errorBanners > 0) {
    const text = (errorBannerTexts || []).join(' ').toLowerCase();
    if (text.includes('could not load') || text.includes('unavailable') || text.includes('error')) {
      return 'FAIL_ERROR_BANNER';
    }
  }

  if (loadingText && bodyText?.length < 200) {
    return 'BLOCKED_LOADING';
  }

  if (bodyText && bodyText.length > 100) {
    return 'PASS';
  }

  return 'BLOCKED_UNKNOWN';
}
