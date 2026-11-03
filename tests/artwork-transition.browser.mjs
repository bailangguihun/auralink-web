// Rendered transition regression tests. All account/API data are synthetic and
// every external request is blocked; these are not production latency results.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { newState, responseFor, id } from './fixtures/loading-runtime.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const localOrigin = value => {
  const url = new URL(value);
  assert.equal(url.protocol, 'http:');
  assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Fixtures run only against local origins');
  return url.origin;
};
const web = localOrigin(process.env.ARTWORK_WEB_URL || 'http://127.0.0.1:21763');
const api = localOrigin(process.env.ARTWORK_API_URL || 'http://127.0.0.1:21764');
const output = process.env.ARTWORK_BROWSER_OUTPUT;
assert(output, 'ARTWORK_BROWSER_OUTPUT is required');
await mkdir(output, { recursive: true });
const selected = process.env.ARTWORK_CASES?.split(',');
const caseNames = [
  'fast-round-trip', 'slow-detail-read', 'slow-route-code', 'slow-return-daily-read',
  'mobile-slow-round-trip', 'bounded-fallback-restores-content', 'user-cancellation-restores-content',
  'reduced-motion-keeps-navigation', 'session-change-clears-transfer',
];
if (selected) for (const name of selected) assert(caseNames.includes(name), `Unknown ARTWORK_CASES entry: ${name}`);
const paintingId = id(90);
const detailPath = `/gallery/${paintingId}`;
const detailApi = `/api/v1/paintings/${paintingId}`;
const dailyApi = '/api/v1/paintings/daily';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const observed = async gate => {
  let timer;
  try {
    await Promise.race([
      gate.observed.promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Expected request was not observed: ${gate.path}`)), 12000); }),
    ]);
  } finally { clearTimeout(timer); }
};
const report = {
  boundary: 'Local production app; synthetic auth/profile/catalog/media. No real account, API, model, or application write. Injected latency is not a measurement of production.',
  web, api, startedAt: new Date().toISOString(), cases: [],
};
const browser = await chromium.launch({ headless: true });

async function scenario(name, options, run) {
  if (selected && !selected.includes(name)) return;
  const record = { name, options, calls: [], routes: [], forbidden: [], errors: [], console: [] };
  report.cases.push(record);
  const fixture = newState();
  const gates = new Map();
  const context = await browser.newContext({
    viewport: { width: options.mobile ? 390 : 1440, height: options.mobile ? 844 : 1000 },
    reducedMotion: options.reducedMotion ? 'reduce' : 'no-preference', serviceWorkers: 'block',
  });
  await context.addInitScript(() => {
    localStorage.setItem('artlive.session.token.v1', 'ISOLATED_ARTWORK_TRANSITION_FIXTURE');
    const now = Date.now.bind(Date);
    window.__artworkClockAdvance = 0;
    Date.now = () => now() + window.__artworkClockAdvance;
    // Keep unrelated automatic navigation prefetch idle. Native user navigation
    // and detail/gallery foreground requests still run normally.
    window.requestIdleCallback = () => 1;
    window.cancelIdleCallback = () => {};
    window.__artworkAnimations = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const overlay = this.closest?.('[data-artwork-transition-overlay]');
      const animation = animate.apply(this, args);
      if (overlay) {
        const result = {
          direction: overlay.getAttribute('data-artwork-transition-direction'),
          startedAt: performance.now(), frames: args[0], finished: false, cancelled: false,
        };
        window.__artworkAnimations.push(result);
        queueMicrotask(() => { result.id = animation.id; });
        animation.addEventListener('finish', () => { result.finished = true; result.finishedAt = performance.now(); }, { once: true });
        animation.addEventListener('cancel', () => { if (!result.finished) result.cancelled = true; }, { once: true });
      }
      return animation;
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => record.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') record.console.push({ text: message.text(), url: message.location().url }); });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin === web) {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        record.forbidden.push({ method, path: url.pathname }); await route.abort(); return;
      }
      if (url.searchParams.has('_rsc')) {
        const entry = { path: url.pathname, injectedDelayMs: url.pathname === detailPath ? options.routeDelayMs || 0 : 0 };
        record.routes.push(entry);
        if (entry.injectedDelayMs) await delay(entry.injectedDelayMs);
      }
      await route.continue(); return;
    }
    if (url.href === 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js') {
      await route.fulfill({ contentType: 'application/javascript', body: '/* isolated inert SDK */' }); return;
    }
    if (url.origin !== api) {
      record.forbidden.push({ method, path: url.origin + url.pathname }); await route.abort(); return;
    }
    const headers = {
      'access-control-allow-origin': web, 'access-control-allow-methods': 'GET,HEAD,OPTIONS',
      'access-control-allow-headers': 'authorization,content-type', 'cache-control': 'no-store',
    };
    if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    const allowedRead = url.pathname === '/api/user/profile' || url.pathname === '/api/v1/paintings'
      || url.pathname.startsWith('/api/v1/paintings/') || url.pathname.startsWith('/api/v1/assets/')
      || ['/api/v1/knowledge/painting-statistics', '/api/v1/knowledge/poetry-graph', '/api/v1/critic/capability'].includes(url.pathname);
    if (!['GET', 'HEAD'].includes(method) || !allowedRead) {
      record.forbidden.push({ method, path: url.pathname }); await route.fulfill({ status: 405, headers, body: '{}' }); return;
    }
    const call = { method, path: url.pathname, startedAt: Date.now(), completed: false };
    record.calls.push(call);
    const gate = gates.get(url.pathname);
    if (gate) { gate.observed.resolve(); await gate.promise; }
    if (url.pathname === detailApi && options.detailDelayMs) {
      call.injectedDelayMs = options.detailDelayMs; await delay(options.detailDelayMs);
    }
    const response = url.pathname === '/api/v1/critic/capability'
      ? { status: 200, contentType: 'application/json', body: { submissionAvailable: false, reason: 'Synthetic read-only fixture; model submissions disabled' } }
      : responseFor(fixture, method, url, null);
    try {
      await route.fulfill({ status: response.status, headers, contentType: response.contentType,
        body: typeof response.body === 'object' && !Buffer.isBuffer(response.body) ? JSON.stringify(response.body) : response.body });
      call.completed = true; call.finishedAt = Date.now();
    } catch (error) {
      // The app can legitimately abort a read after navigation/account change.
      if (!/closed|disposed|handled|canceled|cancelled|invalid interception/i.test(String(error))) throw error;
      call.aborted = true;
    }
  });
  const gate = path => { const value = { path, ...deferred(), observed: deferred() }; gates.set(path, value); return value; };
  const release = (path, value) => { gates.delete(path); value.resolve(); };
  const animations = () => page.evaluate(() => window.__artworkAnimations);
  const resetAnimations = () => page.evaluate(() => { window.__artworkAnimations = []; });
  const cleared = async () => {
    await page.waitForFunction(() => !document.querySelector('[data-artwork-transition-overlay]'));
    assert.equal(await page.locator('[data-artwork-target] img, [data-artwork-source] img').evaluateAll(images => images.filter(image => image.style.visibility === 'hidden').length), 0, 'No hidden target leaks after transition');
  };
  const completedFlight = async direction => {
    await page.waitForFunction(direction => window.__artworkAnimations.some(animation =>
      animation.direction === direction && animation.id === 'artlive-artwork-frame' && animation.finished), direction, { timeout: 9000 });
    const values = (await animations()).filter(animation => animation.direction === direction);
    const frame = values.find(animation => animation.id === 'artlive-artwork-frame');
    assert(frame.finished && !frame.cancelled, `${direction} bitmap flight completes`);
    assert(values.some(animation => animation.id === 'artlive-artwork-image'), `${direction} image crop is animated`);
    assert.notEqual(frame.frames[0].transform, frame.frames[1].transform, `${direction} changes the bitmap geometry`);
    assert(!values.some(animation => animation.id === 'artlive-artwork-fallback'), `${direction} did not degrade to fallback`);
    await cleared();
  };
  const openGallery = async () => {
    await page.goto(web + '/gallery', { waitUntil: 'domcontentloaded' });
    // The desktop sign-out button is hidden on mobile. The resolved detail
    // link proves authentication without depending on a desktop-only control.
    await page.locator(`.gallery-row-item a[data-artwork-link="${paintingId}"][href="${detailPath}"]`).waitFor({ state: 'attached' });
    await page.locator('.gallery-page[data-gallery-ready="true"]').waitFor();
    const source = page.locator(`.gallery-row-item [data-artwork-source="${paintingId}"]`);
    await source.scrollIntoViewIfNeeded();
    await page.waitForFunction(paintingId => {
      const image = document.querySelector(`.gallery-row-item [data-artwork-source="${paintingId}"] img`);
      return image?.complete && image.naturalWidth > 0;
    }, paintingId);
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  };
  const openPainting = async () => {
    // The native Link receives a normal left click. Its covering pseudo-element
    // makes the artwork visible without asking Playwright to click the bitmap.
    await page.locator(`.gallery-row-item a[data-artwork-link="${paintingId}"]`).click();
    await page.waitForURL(url => url.pathname === detailPath);
  };
  const detailVisible = async () => {
    await page.locator(`[data-artwork-target="${paintingId}"] img`).waitFor({ state: 'visible' });
    await page.waitForFunction(paintingId => {
      const image = document.querySelector(`[data-artwork-target="${paintingId}"] img`);
      return image?.complete && image.naturalWidth > 0 && getComputedStyle(image).visibility === 'visible';
    }, paintingId);
  };
  const returnToGallery = async () => {
    await page.locator(`a[data-artwork-return="${paintingId}"]`).click();
    await page.waitForURL(url => url.pathname === '/gallery');
  };
  try {
    await run({ page, record, gate, release, openGallery, openPainting, detailVisible, returnToGallery, completedFlight, cleared, animations, resetAnimations });
    assert.deepEqual(record.forbidden, [], 'No external or application write requests');
    assert.deepEqual(record.errors, [], 'No JavaScript exception');
    record.unexpectedConsole = record.console.filter(entry => {
      const pathname = new URL(entry.url).pathname;
      return !((pathname === `${detailApi}/guide` && entry.text.includes('404'))
        || (pathname === `${detailApi}/critic` && entry.text.includes('503')));
    });
    assert.deepEqual(record.unexpectedConsole, [], 'Only the fixture guide-not-found and critic-unavailable HTTP errors are expected');
    record.status = 'PASS';
  } catch (error) {
    record.status = 'FAIL'; record.error = error.stack;
    await page.screenshot({ path: `${output}/${name}-failure.png`, fullPage: true }).catch(() => {});
  } finally {
    record.animations = await animations().catch(() => []);
    record.finalUrl = page.url();
    for (const value of gates.values()) value.resolve();
    await context.close();
    await writeFile(`${output}/RESULT.json`, JSON.stringify(report, null, 2) + '\n');
    console.log(`${name}: ${record.status}${record.error ? ' ' + record.error.split('\n')[0] : ''}`);
  }
}

try {
  await scenario('fast-round-trip', {}, async ({ openGallery, openPainting, completedFlight, detailVisible, returnToGallery }) => {
    await openGallery(); await openPainting(); await completedFlight('open'); await detailVisible();
    await returnToGallery(); await completedFlight('return');
  });
  await scenario('slow-detail-read', { detailDelayMs: 1200 }, async ({ openGallery, openPainting, completedFlight, detailVisible, record }) => {
    await openGallery(); await openPainting(); await completedFlight('open'); await detailVisible();
    assert(record.calls.some(call => call.path === detailApi && call.injectedDelayMs === 1200 && call.completed), 'The detail read really crossed the old timeout');
  });
  await scenario('slow-route-code', { routeDelayMs: 1100 }, async ({ openGallery, openPainting, completedFlight, detailVisible, record }) => {
    await openGallery(); await openPainting(); await completedFlight('open'); await detailVisible();
    assert(record.routes.some(route => route.path === detailPath && route.injectedDelayMs === 1100), 'A real detail RSC navigation was delayed');
  });
  await scenario('slow-return-daily-read', {}, async ({ page, openGallery, openPainting, completedFlight, detailVisible, returnToGallery, gate, release, record }) => {
    await openGallery(); await openPainting(); await completedFlight('open'); await detailVisible();
    await page.evaluate(() => { window.__artworkClockAdvance += 61000; });
    const daily = gate(dailyApi);
    await returnToGallery(); await observed(daily);
    // Deliberate network delay, not a DOM stability wait: the endpoint is held
    // until after the old 650 ms deadline while the real Gallery remains busy.
    await delay(1100); release(dailyApi, daily);
    await completedFlight('return');
    record.returnDelay = { endpoint: dailyApi, heldMs: 1100, cacheAgeAdvancedMs: 61000 };
  });
  await scenario('mobile-slow-round-trip', { mobile: true, detailDelayMs: 1000 }, async ({ page, openGallery, openPainting, completedFlight, detailVisible, returnToGallery }) => {
    await openGallery(); await openPainting();
    await page.screenshot({ path: `${output}/mobile-waiting.png` });
    await completedFlight('open'); await detailVisible();
    await returnToGallery(); await completedFlight('return');
  });
  await scenario('bounded-fallback-restores-content', {}, async ({ page, openGallery, openPainting, detailVisible, gate, release, cleared, animations }) => {
    await openGallery(); const detail = gate(detailApi); await openPainting(); await observed(detail);
    await page.waitForFunction(() => window.__artworkAnimations.some(animation => animation.id === 'artlive-artwork-fallback' && animation.finished), null, { timeout: 9000 });
    await cleared(); release(detailApi, detail); await detailVisible(); await cleared();
    assert(!(await animations()).some(animation => animation.id === 'artlive-artwork-frame'), 'A timed-out transition does not surprise the user by restarting later');
  });
  await scenario('user-cancellation-restores-content', {}, async ({ page, openGallery, openPainting, detailVisible, gate, release, cleared, animations }) => {
    await openGallery(); const detail = gate(detailApi); await openPainting(); await observed(detail);
    await page.locator('[data-artwork-transition-overlay]').waitFor({ state: 'attached' });
    await page.screenshot({ path: `${output}/desktop-waiting.png` });
    await page.keyboard.press('Escape'); await cleared();
    release(detailApi, detail); await detailVisible(); await cleared();
    assert(!(await animations()).some(animation => animation.id === 'artlive-artwork-frame' && animation.finished), 'Cancelled navigation animation never resumes');
  });
  await scenario('reduced-motion-keeps-navigation', { reducedMotion: true, detailDelayMs: 1000 }, async ({ openGallery, openPainting, detailVisible, returnToGallery, cleared, animations }) => {
    await openGallery(); await openPainting(); await detailVisible(); await cleared();
    await returnToGallery(); await cleared(); assert.deepEqual(await animations(), [], 'Reduced motion never creates an artwork animation');
  });
  await scenario('session-change-clears-transfer', {}, async ({ page, openGallery, openPainting, gate, release, cleared }) => {
    await openGallery(); const detail = gate(detailApi); await openPainting(); await observed(detail);
    await page.locator('[data-artwork-transition-overlay]').waitFor({ state: 'attached' });
    await page.evaluate(() => {
      localStorage.removeItem('artlive.session.token.v1');
      window.dispatchEvent(new StorageEvent('storage', { key: 'artlive.session.token.v1', oldValue: 'ISOLATED_ARTWORK_TRANSITION_FIXTURE', newValue: null }));
    });
    await cleared(); release(detailApi, detail);
    await page.waitForURL(url => url.pathname === '/login');
    await cleared(); assert.equal(await page.locator('[data-artwork-target]').count(), 0, 'No authenticated landing artwork survives a session change');
  });
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  report.outcome = report.cases.length > 0 && report.cases.every(test => test.status === 'PASS') ? 'PASS' : 'FAIL';
  await writeFile(`${output}/RESULT.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(`Artwork transition browser checks: ${report.outcome}`);
  if (report.outcome !== 'PASS') process.exitCode = 1;
}
