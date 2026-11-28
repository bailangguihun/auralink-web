// Production Next.js build with local, isolated read fixtures.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { newState, responseFor } from './fixtures/loading-runtime.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

function loopbackOrigin(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'http:');
  assert(['localhost', '127.0.0.1'].includes(url.hostname));
  return url.origin;
}

const web = loopbackOrigin(process.env.NAVIGATION_WEB_URL || 'http://localhost:3000');
const api = loopbackOrigin(process.env.NAVIGATION_API_URL || 'http://localhost:5000');
const output = process.env.NAVIGATION_BROWSER_OUTPUT;
assert(output, 'Set NAVIGATION_BROWSER_OUTPUT for the request report');
await mkdir(output, { recursive: true });

const PROFILE = '/api/user/profile';
const CATALOG = '/api/v1/paintings';
const DAILY = '/api/v1/paintings/daily';
const FAVORITES = '/api/v1/me/favorites/paintings';
const WECHAT_SCRIPT = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';

const report = { web, api, boundary: 'Local production build with synthetic API responses', cases: [] };
const browser = await chromium.launch({ headless: true, executablePath: process.env.NAVIGATION_CHROMIUM });

async function scenario(name, { authenticated = false, mobile = false }, run) {
  const record = { name, requests: [], errors: [], unexpected: [] };
  report.cases.push(record);
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  if (authenticated) {
    await context.addInitScript(() => {
      localStorage.setItem('artlive.session.token.v1', 'ISOLATED_NAVIGATION_FIXTURE_A');
    });
  }
  const fixture = newState();
  const page = await context.newPage();
  page.on('pageerror', error => record.errors.push(error.message));

  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === web) {
      if (url.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method())) {
        record.unexpected.push({ path: url.pathname, method: request.method() });
        await route.abort();
        return;
      }
      const routeChunk = url.pathname.match(/^\/_next\/static\/chunks\/app(.*)\/(page|loading)-[^/]+\.js$/);
      if (url.searchParams.has('_rsc') || request.headers().rsc === '1') {
        record.requests.push({ kind: 'route', path: url.pathname });
      } else if (routeChunk && (routeChunk[1] || routeChunk[2] === 'page')) {
        // The root loading boundary is shared by every route.
        record.requests.push({ kind: 'chunk', path: routeChunk[1] || '/' });
      }
      await route.continue();
      return;
    }
    if (url.href === WECHAT_SCRIPT) {
      await route.fulfill({ contentType: 'application/javascript', body: '' });
      return;
    }
    if (url.origin !== api || !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      record.unexpected.push({ path: url.pathname, method: request.method() });
      await route.abort();
      return;
    }
    const headers = {
      'access-control-allow-origin': web,
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    record.requests.push({ kind: 'api', path: url.pathname });
    const response = responseFor(fixture, request.method(), url, null);
    await route.fulfill({
      status: response.status, headers, contentType: response.contentType,
      body: Buffer.isBuffer(response.body) ? response.body : JSON.stringify(response.body),
    });
  });

  const ready = path => page.locator(`.route-content[data-route-path="${path}"][data-route-phase="ready"]`).waitFor();
  const open = async path => {
    await page.goto(web + path);
    await ready(path);
  };
  // Allow both an idle callback with a 1 s deadline and Next.js viewport prefetch.
  const settle = async () => {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
  };
  const assertOnlyPage = (from, path, allowedApi) => {
    const unrelated = record.requests.slice(from).filter(request => request.kind === 'api'
      ? !allowedApi(request.path)
      : request.path !== path);
    assert.deepEqual(unrelated, [], `No unrelated route, chunk, or API while on ${path}`);
  };

  try {
    await run({ page, open, ready, settle, assertOnlyPage, requests: record.requests });
    assert.deepEqual(record.unexpected, []);
    assert.deepEqual(record.errors, []);
    assert.deepEqual(fixture.unknown, []);
    record.status = 'PASS';
  } catch (error) {
    record.status = 'FAIL';
    record.error = error.stack;
    await page.screenshot({ path: `${output}/${name}-failure.png` }).catch(() => {});
  } finally {
    await context.close();
    console.log(`${name}: ${record.status}${record.error ? ' ' + record.error.split('\n')[0] : ''}`);
  }
}

try {
  for (const options of [{}, { authenticated: true }, { mobile: true }]) {
    const name = options.mobile ? 'mobile-home' : options.authenticated ? 'signed-in-home' : 'anonymous-home';
    await scenario(name, options, async ({ page, open, ready, settle, assertOnlyPage, requests }) => {
      await open('/');
      if (options.mobile) await page.getByRole('button', { name: '打开导航' }).click();
      const gallery = page.locator('#primary-navigation a[href="/gallery"]');
      await gallery.hover();
      await gallery.focus();
      await settle();
      assertOnlyPage(0, '/', path => options.authenticated && path === PROFILE);

      const beforeGallery = requests.length;
      await gallery.click();
      await page.waitForURL(web + '/gallery');
      await page.getByRole('heading', { name: '隔离画作 1', exact: true }).waitFor();
      await ready('/gallery');
      await settle();
      const galleryReads = requests.slice(beforeGallery).filter(request => request.kind === 'api');
      assert.equal(galleryReads.filter(request => request.path === CATALOG).length, 1);
      assert.equal(galleryReads.filter(request => request.path === DAILY).length, 1);
      assert(galleryReads.some(request => request.path.startsWith('/api/v1/assets/')), 'Gallery media loads after navigation');
      assertOnlyPage(beforeGallery, '/gallery', path => [CATALOG, DAILY].includes(path) || path.startsWith('/api/v1/assets/'));

      if (options.mobile) await page.getByRole('button', { name: '打开导航' }).click();
      const beforeAbout = requests.length;
      await page.locator('#primary-navigation a[href="/about"]').click();
      await page.waitForURL(web + '/about');
      await ready('/about');
      await settle();
      assertOnlyPage(beforeAbout, '/about', () => false);

      if (options.mobile) await page.getByRole('button', { name: '打开导航' }).click();
      const beforeReturn = requests.length;
      await gallery.click();
      await page.waitForURL(web + '/gallery');
      await page.getByRole('heading', { name: '隔离画作 1', exact: true }).waitFor();
      await settle();
      assertOnlyPage(beforeReturn, '/gallery', path => path.startsWith('/api/v1/assets/'));
    });
  }

  await scenario('account-link-waits-for-click', { authenticated: true }, async ({ page, open, settle, assertOnlyPage, requests }) => {
    await open('/account');
    const favorites = page.locator('main a[href="/me"]');
    await favorites.hover();
    await favorites.focus();
    await settle();
    assertOnlyPage(0, '/account', path => path === PROFILE);

    const beforeFavorites = requests.length;
    await favorites.click();
    await page.waitForURL(web + '/me');
    await page.getByText('A 收藏 1', { exact: true }).waitFor();
    await settle();
    assert(requests.slice(beforeFavorites).some(request => request.kind === 'api' && request.path === FAVORITES));
    assertOnlyPage(beforeFavorites, '/me', path => path === FAVORITES || path.startsWith('/api/v1/assets/'));
  });
} finally {
  await browser.close();
  await writeFile(`${output}/RESULT.json`, JSON.stringify(report, null, 2) + '\n');
}
assert(report.cases.every(record => record.status === 'PASS'), 'Navigation loading checks failed');
