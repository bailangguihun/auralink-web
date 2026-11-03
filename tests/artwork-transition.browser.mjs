// Rendered transition regression tests. All account/API data are synthetic and
// every external request is blocked; these are not production latency results.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { newState, responseFor, id, painting } from './fixtures/loading-runtime.mjs';

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
  'mobile-slow-round-trip', 'cold-route-beyond-five-seconds', 'user-cancellation-restores-content',
  'reduced-motion-keeps-navigation', 'session-change-clears-transfer', 'detail-read-failure-after-flight',
  'clipped-image-title-entry', 'undecoded-image-navigation', 'programmatic-scroll-keeps-flight',
  'user-wheel-cancels-flight', 'browser-back-keeps-navigation',
  'viewport-change-return',
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
let artworkImage;
if (process.env.ARTWORK_IMAGE_FILE) {
  const filename = process.env.ARTWORK_IMAGE_FILE;
  assert(/\.(?:jpe?g|png)$/i.test(filename), 'ARTWORK_IMAGE_FILE must be a local JPEG or PNG');
  const bytes = await readFile(filename);
  const contentType = /\.png$/i.test(filename) ? 'image/png' : 'image/jpeg';
  const probe = await browser.newPage();
  try {
    const dimensions = await probe.evaluate(async source => {
      const image = new Image(); image.src = source; await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, `data:${contentType};base64,${bytes.toString('base64')}`);
    artworkImage = { bytes, contentType, ...dimensions };
    report.imageFixture = { filename, bytes: bytes.length, contentType, ...dimensions, sha256: createHash('sha256').update(bytes).digest('hex') };
  } finally { await probe.close(); }
}
function adjustImageMetadata(value) {
  if (!artworkImage || !value || typeof value !== 'object' || Buffer.isBuffer(value)) return;
  if (value.image?.contentUrl?.startsWith('/api/v1/assets/')) Object.assign(value.image, {
    width: artworkImage.width, height: artworkImage.height,
    fileSize: artworkImage.bytes.length, mimeType: artworkImage.contentType,
  });
  for (const item of Object.values(value)) if (item && typeof item === 'object') adjustImageMetadata(item);
}

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
    window.__artworkLiveAnimations = [];
    window.__artworkRequests = [];
    window.__artworkClicks = [];
    document.addEventListener('click', event => {
      const link = event.target instanceof Element ? event.target.closest('a[data-artwork-link],a[data-artwork-return]') : null;
      if (link) window.__artworkClicks.push({ at: performance.now(), direction: link.hasAttribute('data-artwork-return') ? 'return' : 'open', href: link.getAttribute('href') });
    }, true);
    const nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      window.__artworkRequests.push({
        path: url.pathname, origin: url.origin, at: performance.now(),
        activeFrames: window.__artworkLiveAnimations.filter(animation => animation.id === 'artlive-artwork-frame' && animation.playState === 'running').length,
      });
      return nativeFetch.call(this, input, init);
    };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const overlay = this.closest?.('[data-artwork-transition-overlay]');
      const animation = animate.apply(this, args);
      if (overlay) {
        const result = {
          direction: overlay.getAttribute('data-artwork-transition-direction'),
          startedAt: performance.now(), frames: args[0], duration: typeof args[1] === 'object' ? args[1].duration : args[1], finished: false, cancelled: false,
        };
        window.__artworkAnimations.push(result);
        window.__artworkLiveAnimations.push(animation);
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
        const held = gates.get('route:' + url.pathname);
        if (held) { held.observed.resolve(); await held.promise; entry.released = true; }
        if (entry.injectedDelayMs) await delay(entry.injectedDelayMs);
      }
      try { await route.continue(); }
      catch (error) { if (!/closed|disposed|handled|canceled|cancelled|invalid interception/i.test(String(error))) throw error; }
      return;
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
    const response = artworkImage && url.pathname.startsWith('/api/v1/assets/')
      ? { status: 200, contentType: artworkImage.contentType, body: artworkImage.bytes }
      : url.pathname === '/api/v1/critic/capability'
      ? { status: 200, contentType: 'application/json', body: { submissionAvailable: false, reason: 'Synthetic read-only fixture; model submissions disabled' } }
      : url.pathname === detailApi && options.detailStatus
        ? { status: options.detailStatus, contentType: 'application/json', body: { message: 'Synthetic detail read failure' } }
        : responseFor(fixture, method, url, null);
    adjustImageMetadata(response.body);
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
  const release = (path, value) => { gates.delete(path); value.released = true; value.resolve(); };
  const animations = () => page.evaluate(() => window.__artworkAnimations);
  const resetAnimations = () => page.evaluate(() => { window.__artworkAnimations = []; });
  const cleared = async () => {
    await page.waitForFunction(() => !document.querySelector('[data-artwork-transition-overlay]'));
    assert.equal(await page.locator('[data-artwork-target] img, [data-artwork-source] img').evaluateAll(images => images.filter(image => image.style.visibility === 'hidden').length), 0, 'No hidden target leaks after transition');
  };
  const startedFlight = async direction => {
    await page.waitForFunction(direction => window.__artworkAnimations.some(animation =>
      animation.direction === direction && animation.id === 'artlive-artwork-frame'), direction, { timeout: 2500 });
    const frame = (await animations()).find(animation => animation.direction === direction && animation.id === 'artlive-artwork-frame');
    const click = await page.evaluate(direction => window.__artworkClicks.find(event => event.direction === direction), direction);
    assert(click, `${direction} has an actual click event`);
    const clickToStartMs = frame.startedAt - click.at;
    if (name !== 'viewport-change-return') assert(clickToStartMs >= 0 && clickToStartMs < 250, `${direction} begins within 250 ms of the click, independently of network readiness`);
    record.flightTimings ??= [];
    if (!record.flightTimings.some(value => value.direction === direction)) record.flightTimings.push({ direction, clickAt: click.at, startedAt: frame.startedAt, clickToStartMs });
    return frame;
  };
  const completedFlight = async direction => {
    await startedFlight(direction);
    await page.waitForFunction(direction => window.__artworkAnimations.some(animation =>
      animation.direction === direction && animation.id === 'artlive-artwork-frame' && animation.finished), direction, { timeout: 2500 });
    const values = (await animations()).filter(animation => animation.direction === direction);
    const frames = values.filter(animation => animation.id === 'artlive-artwork-frame');
    assert.equal(frames.length, 1, `${direction} has one main flight`);
    const frame = frames[0];
    assert(frame.finished && !frame.cancelled, `${direction} bitmap flight completes`);
    assert(values.some(animation => animation.id === 'artlive-artwork-image'), `${direction} image crop is animated`);
    assert.notEqual(frame.frames[0].transform, frame.frames[1].transform, `${direction} changes the bitmap geometry`);
    assert(!values.some(animation => animation.id === 'artlive-artwork-fallback' && animation.startedAt < frame.finishedAt), `${direction} never falls back before completing the main flight`);
    return frame;
  };
  const deferredReads = async () => {
    const data = await page.evaluate(() => ({ animations: window.__artworkAnimations, requests: window.__artworkRequests }));
    const frame = data.animations.find(animation => animation.direction === 'open' && animation.id === 'artlive-artwork-frame');
    assert(frame?.finished, 'The main opening flight completed');
    const reads = data.requests.filter(request => request.origin === api && (request.path === detailApi
      || request.path.startsWith(detailApi + '/') || request.path === '/api/v1/critic/capability'));
    assert(reads.some(request => request.path === detailApi), 'The detail GET was actually issued');
    for (const request of reads) {
      assert.equal(request.activeFrames, 0, `${request.path} does not start during the main flight`);
      assert(request.at >= frame.startedAt + Number(frame.duration) - 25, `${request.path} waits until the opening animation finishes`);
    }
    record.deferredReads = reads;
  };
  const previewVisible = async () => {
    const preview = page.locator('.detail-page [data-artwork-preview="true"]');
    await preview.locator('.detail-info [aria-label="正在读取作品资料"]').waitFor();
    await page.waitForFunction(paintingId => {
      const image = document.querySelector(`.detail-page [data-artwork-preview="true"] [data-artwork-target="${paintingId}"] img`);
      return image?.complete && image.naturalWidth > 0 && getComputedStyle(image).visibility === 'visible';
    }, paintingId);
    assert(await preview.getByRole('button', { name: '引用作品发帖', exact: true }).isDisabled());
    assert(await preview.getByRole('button', { name: '收藏', exact: true }).isDisabled());
    record.previewWhileDetailPending = true;
  };
  const openGallery = async ({ decoded = true } = {}) => {
    await page.goto(web + '/gallery', { waitUntil: 'domcontentloaded' });
    // The desktop sign-out button is hidden on mobile. The resolved detail
    // link proves authentication without depending on a desktop-only control.
    await page.locator(`.gallery-row-item a[data-artwork-link="${paintingId}"][href="${detailPath}"]`).waitFor({ state: 'attached' });
    await page.locator('.gallery-page[data-gallery-ready="true"]').waitFor();
    const source = page.locator(`.gallery-row-item [data-artwork-source="${paintingId}"]`);
    await source.scrollIntoViewIfNeeded();
    if (decoded) await page.waitForFunction(paintingId => {
      const image = document.querySelector(`.gallery-row-item [data-artwork-source="${paintingId}"] img`);
      return image?.complete && image.naturalWidth > 0;
    }, paintingId);
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  };
  const captureMoving = async direction => {
    if (process.env.ARTWORK_CAPTURE_FRAMES !== '1'
      || !['fast-round-trip', 'slow-detail-read', 'slow-return-daily-read', 'mobile-slow-round-trip', 'clipped-image-title-entry'].includes(name)) return;
    await startedFlight(direction);
    await page.screenshot({ path: `${output}/${name}-${direction}-moving.png` });
  };
  const openPainting = async () => {
    // The native Link receives a normal left click. Its covering pseudo-element
    // makes the artwork visible without asking Playwright to click the bitmap.
    await page.locator(`.gallery-row-item a[data-artwork-link="${paintingId}"]`).click({ noWaitAfter: true });
    await captureMoving('open');
  };
  const detailVisible = async () => {
    await page.locator(`.detail-page .detail-layout:not([data-artwork-preview]) [data-artwork-target="${paintingId}"] img`).waitFor({ state: 'visible' });
    await page.waitForFunction(paintingId => {
      const image = document.querySelector(`.detail-page .detail-layout:not([data-artwork-preview]) [data-artwork-target="${paintingId}"] img`);
      return image?.complete && image.naturalWidth > 0 && getComputedStyle(image).visibility === 'visible';
    }, paintingId);
    if (process.env.ARTWORK_CAPTURE_FRAMES === '1') await page.screenshot({ path: `${output}/${name}-detail-loaded.png` });
  };
  const returnToGallery = async () => {
    await page.locator(`.detail-page a[data-artwork-return="${paintingId}"]`).click({ noWaitAfter: true });
    await captureMoving('return');
  };
  try {
    await run({ page, record, gate, release, openGallery, openPainting, detailVisible, returnToGallery,
      startedFlight, completedFlight, cleared, animations, resetAnimations, deferredReads, previewVisible });
    const main = (await animations()).filter(animation => animation.id === 'artlive-artwork-frame');
    for (const direction of ['open', 'return']) assert(main.filter(animation => animation.direction === direction).length <= 1, 'Data handoff never starts a second main flight');
    for (const settle of (await animations()).filter(animation => animation.id?.startsWith('artlive-artwork-settle-'))) {
      assert(Number(settle.duration) <= 120, 'Landing geometry correction is short');
    }
    assert.deepEqual(record.forbidden, [], 'No external or application write requests');
    assert.deepEqual(record.errors, [], 'No JavaScript exception');
    record.unexpectedConsole = record.console.filter(entry => {
      let pathname;
      try { pathname = new URL(entry.url).pathname; } catch { return true; }
      return !((pathname === `${detailApi}/guide` && entry.text.includes('404'))
        || (pathname === `${detailApi}/critic` && entry.text.includes('503'))
        || (pathname === detailApi && options.detailStatus && entry.text.includes(String(options.detailStatus))));
    });
    assert.deepEqual(record.unexpectedConsole, [], 'Only the fixture guide-not-found and critic-unavailable HTTP errors are expected');
    record.status = 'PASS';
    if (process.env.ARTWORK_CAPTURE_FRAMES === '1') await page.screenshot({ path: `${output}/${name}-final.png` });
  } catch (error) {
    record.status = 'FAIL'; record.error = error.stack;
    await page.screenshot({ path: `${output}/${name}-failure.png`, fullPage: true }).catch(() => {});
  } finally {
    record.animations = await animations().catch(() => []);
    record.browserTimeline = await page.evaluate(() => ({ requests: window.__artworkRequests, clicks: window.__artworkClicks })).catch(() => ({}));
    record.finalUrl = page.url();
    for (const value of gates.values()) value.resolve();
    await context.close();
    await writeFile(`${output}/RESULT.json`, JSON.stringify(report, null, 2) + '\n');
    console.log(`${name}: ${record.status}${record.error ? ' ' + record.error.split('\n')[0] : ''}`);
  }
}

try {
  await scenario('fast-round-trip', {}, async ({ openGallery, openPainting, completedFlight, detailVisible, returnToGallery, deferredReads, cleared }) => {
    await openGallery(); await openPainting(); await completedFlight('open'); await detailVisible(); await cleared(); await deferredReads();
    await returnToGallery(); await completedFlight('return'); await cleared();
  });
  await scenario('slow-detail-read', {}, async ({ page, openGallery, openPainting, completedFlight, detailVisible, gate, release, previewVisible, deferredReads, cleared }) => {
    await openGallery(); const detail = gate(detailApi); await openPainting();
    await completedFlight('open'); assert(!detail.released); await observed(detail); await previewVisible(); await deferredReads();
    await page.screenshot({ path: `${output}/desktop-preview-pending.png` });
    release(detailApi, detail); await detailVisible(); await cleared();
  });
  await scenario('slow-route-code', {}, async ({ openGallery, openPainting, completedFlight, detailVisible, gate, release, deferredReads, cleared, record }) => {
    await openGallery(); const route = gate('route:' + detailPath), detail = gate(detailApi); await openPainting();
    await completedFlight('open'); await observed(route); assert(!route.released);
    assert(!record.calls.some(call => call.path === detailApi), 'Cold route still pending while main flight already completed');
    release('route:' + detailPath, route); await observed(detail); release(detailApi, detail);
    await detailVisible(); await cleared(); await deferredReads();
  });
  await scenario('cold-route-beyond-five-seconds', {}, async ({ page, openGallery, openPainting, completedFlight, detailVisible, gate, release, cleared, animations }) => {
    await openGallery(); const route = gate('route:' + detailPath); await openPainting();
    const main = await completedFlight('open'); await observed(route);
    await delay(5500); assert(!route.released, 'Route remains blocked past the old 5 s deadline');
    const values = await animations();
    assert(values.some(animation => animation.id === 'artlive-artwork-frame' && animation.finished), 'Main flight remains recorded even with a very slow route');
    for (const fallback of values.filter(animation => animation.id === 'artlive-artwork-fallback')) assert(fallback.startedAt >= main.finishedAt);
    await page.screenshot({ path: `${output}/cold-route-after-five-seconds.png` });
    release('route:' + detailPath, route); await detailVisible(); await cleared();
  });
  await scenario('slow-return-daily-read', {}, async ({ page, openGallery, openPainting, completedFlight, detailVisible, returnToGallery, gate, release, cleared, record }) => {
    await openGallery(); await openPainting(); await completedFlight('open'); await detailVisible(); await cleared();
    await page.evaluate(() => { window.__artworkClockAdvance += 61000; });
    const daily = gate(dailyApi); await returnToGallery();
    await completedFlight('return'); assert(!daily.released); await observed(daily);
    record.returnCompletedBeforeDailyRelease = true;
    release(dailyApi, daily); await page.locator('.gallery-page[data-gallery-ready="true"]').waitFor(); await cleared();
  });
  await scenario('mobile-slow-round-trip', { mobile: true }, async ({ page, openGallery, openPainting, completedFlight, detailVisible, returnToGallery, gate, release, previewVisible, deferredReads, cleared }) => {
    await openGallery(); const detail = gate(detailApi); await openPainting(); await completedFlight('open');
    await observed(detail); await previewVisible(); await deferredReads();
    await page.screenshot({ path: `${output}/mobile-preview-pending.png` });
    release(detailApi, detail); await detailVisible(); await cleared();
    await page.evaluate(() => { window.__artworkClockAdvance += 61000; });
    const daily = gate(dailyApi); await returnToGallery(); await completedFlight('return'); await observed(daily);
    assert(!daily.released); release(dailyApi, daily); await cleared();
  });
  await scenario('user-cancellation-restores-content', {}, async ({ page, openGallery, openPainting, startedFlight, detailVisible, gate, release, cleared, animations }) => {
    await openGallery(); const route = gate('route:' + detailPath); await openPainting(); await startedFlight('open');
    await page.keyboard.press('Escape'); await cleared(); release('route:' + detailPath, route);
    await detailVisible(); await cleared();
    assert((await animations()).some(animation => animation.id === 'artlive-artwork-frame' && animation.cancelled), 'User cancellation interrupts the main flight');
  });
  await scenario('reduced-motion-keeps-navigation', { reducedMotion: true }, async ({ openGallery, openPainting, detailVisible, returnToGallery, cleared, animations }) => {
    await openGallery(); await openPainting(); await detailVisible(); await cleared();
    await returnToGallery(); await cleared(); assert.deepEqual(await animations(), [], 'Reduced motion never creates an artwork animation');
  });
  await scenario('session-change-clears-transfer', {}, async ({ page, openGallery, openPainting, startedFlight, gate, release, cleared }) => {
    await openGallery(); const route = gate('route:' + detailPath); await openPainting(); await startedFlight('open');
    await page.evaluate(() => {
      localStorage.removeItem('artlive.session.token.v1');
      window.dispatchEvent(new StorageEvent('storage', { key: 'artlive.session.token.v1', oldValue: 'ISOLATED_ARTWORK_TRANSITION_FIXTURE', newValue: null }));
    });
    await cleared(); release('route:' + detailPath, route);
    await page.waitForURL(url => url.pathname === '/login'); await cleared();
    assert.equal(await page.locator('.detail-page [data-artwork-target]').count(), 0, 'Old authenticated target never reappears');
  });
  await scenario('detail-read-failure-after-flight', { detailStatus: 503 }, async ({ page, openGallery, openPainting, completedFlight, cleared, deferredReads }) => {
    await openGallery(); await openPainting(); await completedFlight('open');
    await page.getByText('作品详情加载失败', { exact: true }).waitFor(); await cleared(); await deferredReads();
  });
  await scenario('clipped-image-title-entry', {}, async ({ page, openGallery, openPainting, completedFlight, detailVisible, cleared, record }) => {
    await openGallery();
    record.entryGeometry = await page.evaluate(async paintingId => {
      const image = document.querySelector(`.gallery-row-item [data-artwork-source="${paintingId}"] img`);
      const link = document.querySelector(`.gallery-row-item a[data-artwork-link="${paintingId}"]`);
      const top = document.querySelector('.topbar').getBoundingClientRect().bottom;
      window.scrollBy({ top: image.getBoundingClientRect().bottom - top - 8, behavior: 'instant' });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { imageBottom: image.getBoundingClientRect().bottom, topbarBottom: top, titleTop: link.getBoundingClientRect().top, titleBottom: link.getBoundingClientRect().bottom, viewportHeight: innerHeight, decoded: image.complete && image.naturalWidth > 0 };
    }, paintingId);
    assert(record.entryGeometry.decoded);
    assert(record.entryGeometry.imageBottom <= record.entryGeometry.topbarBottom + 12, 'Only a small strip of the image remains visible');
    assert(record.entryGeometry.titleTop >= record.entryGeometry.topbarBottom && record.entryGeometry.titleBottom <= record.entryGeometry.viewportHeight, 'The card title is a visible click target');
    await openPainting(); await completedFlight('open'); await detailVisible(); await cleared();
  });
  await scenario('undecoded-image-navigation', {}, async ({ openGallery, openPainting, detailVisible, gate, release, cleared, animations }) => {
    const assetPath = painting(90).image.contentUrl;
    const image = gate(assetPath), detail = gate(detailApi);
    await openGallery({ decoded: false }); await observed(image); await openPainting(); await observed(detail);
    assert.deepEqual(await animations(), [], 'An undecoded source uses normal navigation without inventing an image flight');
    release(assetPath, image); release(detailApi, detail); await detailVisible(); await cleared();
    assert.deepEqual(await animations(), [], 'Late image data does not start a surprise animation');
  });
  await scenario('programmatic-scroll-keeps-flight', {}, async ({ page, openGallery, openPainting, startedFlight, completedFlight, detailVisible, gate, release, cleared }) => {
    await openGallery(); const route = gate('route:' + detailPath); await openPainting(); await startedFlight('open');
    await page.evaluate(() => window.scrollBy({ top: 80, behavior: 'instant' }));
    await completedFlight('open'); release('route:' + detailPath, route); await detailVisible(); await cleared();
  });
  await scenario('user-wheel-cancels-flight', {}, async ({ page, openGallery, openPainting, startedFlight, detailVisible, gate, release, cleared, animations }) => {
    await openGallery(); const route = gate('route:' + detailPath); await openPainting(); await startedFlight('open');
    await page.mouse.wheel(0, 80); await cleared(); release('route:' + detailPath, route); await detailVisible(); await cleared();
    assert((await animations()).some(animation => animation.id === 'artlive-artwork-frame' && animation.cancelled), 'A user wheel cancels the flight instead of moving a stale geometry');
  });
  await scenario('browser-back-keeps-navigation', {}, async ({ page, openGallery, openPainting, completedFlight, detailVisible, cleared, animations }) => {
    await openGallery(); await openPainting(); await completedFlight('open'); await detailVisible(); await cleared();
    await page.goBack(); await page.waitForURL(url => url.pathname === '/gallery');
    await page.locator('.gallery-page[data-gallery-ready="true"]').waitFor(); await cleared();
    assert(!(await animations()).some(animation => animation.direction === 'return'), 'Browser popstate preserves the current non-animated-back contract');
  });
  await scenario('viewport-change-return', {}, async ({ page, openGallery, openPainting, completedFlight, detailVisible, returnToGallery, gate, release, cleared, animations }) => {
    await openGallery(); await openPainting(); await completedFlight('open'); await detailVisible(); await cleared();
    await page.setViewportSize({ width: 820, height: 900 });
    await page.evaluate(() => { window.__artworkClockAdvance += 61000; });
    const daily = gate(dailyApi); await returnToGallery(); await observed(daily);
    assert(!(await animations()).some(animation => animation.direction === 'return' && animation.id === 'artlive-artwork-frame'), 'Invalid old viewport geometry is not used before the real gallery is ready');
    release(dailyApi, daily); await page.locator('.gallery-page[data-gallery-ready="true"]').waitFor(); await cleared();
    const frames = (await animations()).filter(animation => animation.direction === 'return' && animation.id === 'artlive-artwork-frame');
    assert(frames.length <= 1, 'Viewport-change fallback has at most one main flight');
    assert(frames.every(animation => animation.finished), 'Any safe fallback flight completes');
  });
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  report.outcome = report.cases.length > 0 && report.cases.every(test => test.status === 'PASS') ? 'PASS' : 'FAIL';
  await writeFile(`${output}/RESULT.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(`Artwork transition browser checks: ${report.outcome}`);
  if (report.outcome !== 'PASS') process.exitCode = 1;
}
