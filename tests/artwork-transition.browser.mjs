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
  'background-and-image-first-frame', 'background-longer-than-image',
  'tablet-landscape-round-trip', 'resize-clears-background',
  'background-click-blocks-old-card', 'background-click-blocks-old-favorite',
  'held-touch-survives-route-handoff',
  'right-button-clears-background', 'middle-button-clears-background',
  'fast-detail-waits-for-background', 'detail-cache-reopen', 'session-switch-rejects-old-detail',
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
  browserAvailability: 'Browser plugin not available; existing Playwright is used without installing dependencies.',
  web, api, startedAt: new Date().toISOString(), cases: [],
};
const browser = await chromium.launch({ headless: true });
report.browser = { engine: 'Chromium', version: browser.version() };
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
    viewport: options.viewport || { width: options.mobile ? 390 : 1440, height: options.mobile ? 844 : 1000 },
    hasTouch: Boolean(options.touch),
    isMobile: Boolean(options.isMobile),
    reducedMotion: options.reducedMotion ? 'reduce' : 'no-preference', serviceWorkers: 'block',
  });
  await context.addInitScript(({ backgroundDurationMs }) => {
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
    window.__artworkSources = [];
    window.__artworkFirstPaints = [];
    window.__artworkTextDuringVisuals = [];
    window.__artworkInputEvents = [];
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'contextmenu', 'auxclick', 'click']) {
      document.addEventListener(type, event => {
        const target = event.target instanceof Element ? event.target : null;
        const entry = { type, at: performance.now(), target: target?.tagName,
          pointerType: event.pointerType || null, button: event.button ?? null, href: target?.closest('a')?.getAttribute('href') || null,
          favorite: Boolean(target?.closest('.favorite-button')),
          scene: Boolean(target?.closest('[data-artwork-transition-scene]')) };
        window.__artworkInputEvents.push(entry);
        queueMicrotask(() => { entry.defaultPreventedAfter = event.defaultPrevented; });
      }, { capture: true, passive: true });
    }
    const drawnCanvases = new WeakSet();
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      const result = drawImage.apply(this, args);
      drawnCanvases.add(this.canvas);
      return result;
    };
    document.addEventListener('click', event => {
      const link = event.target instanceof Element ? event.target.closest('a[data-artwork-link],a[data-artwork-return]') : null;
      if (link) {
        const direction = link.hasAttribute('data-artwork-return') ? 'return' : 'open';
        window.__artworkClicks.push({ at: performance.now(), direction, href: link.getAttribute('href') });
        const owner = direction === 'return' ? link.closest('.detail-artwork') : link.closest('[data-artwork-source]');
        window.__artworkSources.push({ direction, image: owner?.querySelector('img') });
      }
    }, true);
    const nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const entry = {
        path: url.pathname, origin: url.origin, at: performance.now(),
        activeFrames: window.__artworkLiveAnimations.filter(animation => animation.id === 'artlive-artwork-frame' && animation.playState === 'running').length,
        activeBackgrounds: window.__artworkLiveAnimations.filter(animation => animation.id === 'artlive-artwork-background' && animation.playState === 'running').length,
      };
      const signal = input instanceof Request ? input.signal : init?.signal;
      signal?.addEventListener('abort', () => { entry.abortedAt = performance.now(); }, { once: true });
      window.__artworkRequests.push(entry);
      return nativeFetch.call(this, input, init);
    };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const overlay = this.closest?.('[data-artwork-transition-overlay], [data-artwork-transition-scene]');
      // Deliberately make the background slower than the image in one case so
      // a gate that only waits for the image cannot accidentally pass.
      if (backgroundDurationMs && this.closest?.('[data-artwork-transition-scene]')) {
        args[1] = { ...(typeof args[1] === 'object' ? args[1] : {}), duration: backgroundDurationMs };
      }
      const animation = animate.apply(this, args);
      if (overlay) {
        const result = {
          direction: overlay.getAttribute('data-artwork-transition-direction'),
          startedAt: performance.now(), frames: args[0], duration: typeof args[1] === 'object' ? args[1].duration : args[1], finished: false, cancelled: false,
        };
        window.__artworkAnimations.push(result);
        window.__artworkLiveAnimations.push(animation);
        queueMicrotask(() => {
          result.id = animation.id;
          if (animation.id !== 'artlive-artwork-frame') return;
          requestAnimationFrame(() => {
            const scene = document.querySelector('[data-artwork-transition-scene]');
            const moving = document.querySelector('[data-artwork-transition-overlay]');
            const source = window.__artworkSources.findLast(value => value.direction === result.direction)?.image;
            const rect = scene?.getBoundingClientRect();
            const detailPanel = scene?.querySelector('.detail-info')?.getBoundingClientRect();
            const css = scene && getComputedStyle(scene);
            window.__artworkFirstPaints.push({
              direction: result.direction, at: performance.now(),
              cancelledBeforePaint: animation.playState === 'idle' && !result.finished,
              movingBitmap: moving ? { imageCount: moving.querySelectorAll('img').length,
                canvases: Array.from(moving.querySelectorAll('canvas')).map(canvas => ({ width: canvas.width,
                  height: canvas.height, drawn: drawnCanvases.has(canvas), visibility: getComputedStyle(canvas).visibility })) } : null,
              scene: scene ? { direction: scene.dataset.artworkTransitionDirection,
                rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
                visibility: css.visibility, display: css.display, opacity: css.opacity,
                background: css.backgroundColor, pointerEvents: css.pointerEvents,
                hiddenFromAccessibility: scene.getAttribute('aria-hidden') === 'true',
                inertScenery: Boolean(scene.querySelector('[inert]')),
                imageCount: scene.querySelectorAll('img').length,
                detailPanel: detailPanel ? { top: detailPanel.top, bottom: detailPanel.bottom,
                  width: detailPanel.width, height: detailPanel.height } : null,
                canvases: Array.from(scene.querySelectorAll('canvas')).map(canvas => ({ width: canvas.width,
                  height: canvas.height, visibility: getComputedStyle(canvas).visibility,
                  drawn: drawnCanvases.has(canvas) })) } : null,
              sourceHidden: Boolean(source && (!source.isConnected || getComputedStyle(source).visibility === 'hidden')),
              viewport: { width: innerWidth, height: innerHeight },
              topbarBottom: document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0,
            });
          });
          const inspectText = () => {
            const active = window.__artworkLiveAnimations.some(value =>
              ['artlive-artwork-frame', 'artlive-artwork-background'].includes(value.id) && value.playState === 'running');
            if (!active || result.direction !== 'open') return;
            const text = Array.from(document.querySelectorAll('.detail-page .detail-viewer-heading, .detail-page .detail-info'))
              .filter(node => !node.closest('[data-artwork-transition-scene], [data-artwork-measure]')
                && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
              .map(node => node.innerText.trim()).filter(Boolean);
            if (text.length) window.__artworkTextDuringVisuals.push({ at: performance.now(), text });
            requestAnimationFrame(inspectText);
          };
          requestAnimationFrame(inspectText);
        });
        animation.addEventListener('finish', () => { result.finished = true; result.finishedAt = performance.now(); }, { once: true });
        animation.addEventListener('cancel', () => { if (!result.finished) result.cancelled = true; }, { once: true });
      }
      return animation;
    };
  }, { backgroundDurationMs: options.backgroundDurationMs || 0 });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => record.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') record.console.push({ text: message.text(), url: message.location().url }); });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin === web) {
      // Account changes clear the synthetic community media cookie. Keep this
      // session cleanup inside the fixture; never send it to the real proxy.
      if (url.pathname === '/api/community/v2/api/media-session' && method === 'DELETE') {
        await route.fulfill({ status: 204 }); return;
      }
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
    const account = options.accountAware && request.headers().authorization?.includes('FIXTURE_ACCOUNT_B') ? 'B' : 'A';
    const call = { method, path: url.pathname, account, startedAt: Date.now(), completed: false };
    record.calls.push(call);
    const gate = gates.get(url.pathname);
    const gated = gate && (!gate.account || gate.account === account);
    if (gated) { gate.observed.resolve(); await gate.promise; }
    if (url.pathname === detailApi && options.detailDelayMs) {
      call.injectedDelayMs = options.detailDelayMs; await delay(options.detailDelayMs);
    }
    const response = artworkImage && url.pathname.startsWith('/api/v1/assets/')
      ? { status: 200, contentType: artworkImage.contentType, body: artworkImage.bytes }
      : url.pathname === '/api/v1/critic/capability'
      ? { status: 200, contentType: 'application/json', body: { submissionAvailable: false, reason: 'Synthetic read-only fixture; model submissions disabled' } }
      : url.pathname === detailApi && options.detailStatus
        ? { status: options.detailStatus, contentType: 'application/json', body: { message: 'Synthetic detail read failure' } }
        : responseFor(fixture, method, url, null, account);
    if (url.pathname === detailApi && response.status === 200) {
      if (options.generatedText) response.body.generatedText = options.generatedText;
      if (options.accountAware) {
        response.body.title = account === 'A' ? '旧账号详情禁止回流' : '新账号作品详情';
        response.body.generatedText = account === 'A' ? '旧账号响应只用于隔离验证。' : '新账号响应已经确认。';
      }
    }
    adjustImageMetadata(response.body);
    try {
      await route.fulfill({ status: response.status, headers, contentType: response.contentType,
        body: typeof response.body === 'object' && !Buffer.isBuffer(response.body) ? JSON.stringify(response.body) : response.body });
      call.completed = true; call.finishedAt = Date.now();
    } catch (error) {
      // The app can legitimately abort a read after navigation/account change.
      if (!/closed|disposed|handled|canceled|cancelled|invalid interception/i.test(String(error))) throw error;
      call.aborted = true;
    } finally {
      if (gated) gate.delivered.resolve();
    }
  });
  const gate = (path, scope = {}) => { const value = { path, ...scope, ...deferred(), observed: deferred(), delivered: deferred() }; gates.set(path, value); return value; };
  const release = (path, value) => { gates.delete(path); value.released = true; value.resolve(); };
  const animations = () => page.evaluate(() => window.__artworkAnimations);
  const resetAnimations = () => page.evaluate(() => {
    window.__artworkAnimations = []; window.__artworkClicks = []; window.__artworkSources = [];
    window.__artworkFirstPaints = []; window.__artworkTextDuringVisuals = []; window.__artworkRequests = [];
  });
  const cleared = async () => {
    await page.waitForFunction(() => !document.querySelector('[data-artwork-transition-overlay], [data-artwork-transition-scene]'));
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
  const firstPaint = async direction => {
    await page.waitForFunction(direction => window.__artworkFirstPaints.some(value => value.direction === direction), direction);
    const value = await page.evaluate(direction => window.__artworkFirstPaints.find(value => value.direction === direction), direction);
    assert(value.movingBitmap && value.movingBitmap.imageCount === 0 && value.movingBitmap.canvases.length === 1
      && value.movingBitmap.canvases.every(canvas => canvas.drawn && canvas.width > 0 && canvas.height > 0 && canvas.visibility === 'visible'),
      `${direction} first image-animation frame contains the synchronously drawn source bitmap, without a new asynchronous image`);
    assert(value.scene, `${direction} has a destination background in the first image-animation frame`);
    assert.equal(value.scene.direction, direction, `${direction} background belongs to the same transition`);
    assert.notEqual(value.scene.display, 'none');
    assert.equal(value.scene.visibility, 'visible');
    assert(value.scene.rect.left <= 1 && value.scene.rect.right >= value.viewport.width - 1, 'Destination background covers the content width');
    assert(value.scene.rect.top <= value.topbarBottom + 1 && value.scene.rect.bottom >= value.viewport.height - 1, 'Destination background covers the content below the top bar');
    assert(value.scene.hiddenFromAccessibility && value.scene.pointerEvents === 'auto' && value.scene.inertScenery,
      'Background shields old controls while its scenery remains decorative and inert');
    if (direction === 'return') {
      assert.equal(value.scene.imageCount, 0, 'The gallery snapshot does not create new image elements or repeat image reads');
      const visibleCanvases = value.scene.canvases.filter(canvas => canvas.visibility === 'visible');
      assert(visibleCanvases.length > 0 && visibleCanvases.every(canvas => canvas.width > 0 && canvas.height > 0 && canvas.drawn),
        'The returned gallery uses the already decoded visible bitmaps, drawn successfully to bounded canvases');
      assert(value.scene.canvases.filter(canvas => !canvas.drawn).every(canvas => canvas.visibility === 'hidden' && canvas.width === 1 && canvas.height === 1),
        'Only hidden one-pixel placeholders are left undrawn, including the moving artwork slot');
    }
    assert(value.sourceHidden, `${direction} source image is hidden while its moving copy is displayed`);
    const values = await animations();
    const image = values.find(value => value.direction === direction && value.id === 'artlive-artwork-frame');
    const background = values.find(value => value.direction === direction && value.id === 'artlive-artwork-background');
    assert(background, `${direction} background transition starts with the image`);
    assert(Math.abs(background.startedAt - image.startedAt) < 32, `${direction} image and background start within one frame`);
    record.firstPaints ??= [];
    record.firstPaints.push(value);
    return value;
  };
  const completedBackground = async direction => {
    await page.waitForFunction(direction => window.__artworkAnimations.some(animation =>
      animation.direction === direction && animation.id === 'artlive-artwork-background' && animation.finished), direction, { timeout: 2500 });
    const background = (await animations()).find(animation => animation.direction === direction && animation.id === 'artlive-artwork-background');
    assert(background.finished && !background.cancelled, `${direction} background transition completes`);
    return background;
  };
  const deferredReads = async () => {
    const data = await page.evaluate(() => ({ animations: window.__artworkAnimations, requests: window.__artworkRequests }));
    const frame = data.animations.find(animation => animation.direction === 'open' && animation.id === 'artlive-artwork-frame');
    const background = data.animations.find(animation => animation.direction === 'open' && animation.id === 'artlive-artwork-background');
    assert(frame?.finished, 'The main opening flight completed');
    assert(background?.finished, 'The opening background transition completed');
    const reads = data.requests.filter(request => request.origin === api && (request.path === detailApi
      || request.path.startsWith(detailApi + '/') || request.path === '/api/v1/critic/capability'));
    assert(reads.some(request => request.path === detailApi), 'The detail GET was actually issued');
    // The chosen detail read overlaps the local visual transition. Dependent
    // business reads still start only after both visuals finish and data commits.
    for (const request of reads.filter(request => request.path !== detailApi)) {
      assert.equal(request.activeFrames, 0, `${request.path} does not start during the main flight`);
      assert.equal(request.activeBackgrounds, 0, `${request.path} does not start during the background transition`);
      assert(request.at >= frame.finishedAt, `${request.path} waits until the actual opening finish event`);
      assert(request.at >= background.finishedAt, `${request.path} waits until the actual background finish event`);
    }
    assert.deepEqual(await page.evaluate(() => window.__artworkTextDuringVisuals), [], 'Preview heading and detail text stay concealed until both visuals complete');
    record.deferredReads = reads;
  };
  const previewVisible = async () => {
    const preview = page.locator('.detail-page [data-artwork-preview="true"]');
    await preview.locator('.detail-info [aria-label="正在读取作品资料"]').waitFor({ state: 'attached' });
    await page.waitForFunction(paintingId => {
      const image = document.querySelector(`.detail-page [data-artwork-preview="true"] [data-artwork-target="${paintingId}"] img`);
      return image?.complete && image.naturalWidth > 0;
    }, paintingId);
    assert(await preview.getByRole('button', { name: '引用作品发帖', exact: true, includeHidden: true }).isDisabled());
    assert(await preview.getByRole('button', { name: '收藏', exact: true, includeHidden: true }).isDisabled());
    assert.equal(await page.locator('.route-content').evaluate(element => getComputedStyle(element).opacity), '0', 'Pending detail stays concealed until all current content is ready');
    const header = preview.locator('.detail-info > header');
    await header.locator('h1').waitFor({ state: 'attached' });
    assert.equal((await header.locator('h1').textContent()).trim(), record.previewMetadata.title, 'Known title is prepared while detail data is pending');
    assert.equal((await header.locator('p').textContent()).trim(), record.previewMetadata.author, 'Known author is prepared while detail data is pending');
    assert.equal((await header.locator('span').textContent()).trim(), record.previewMetadata.period, 'Known period is prepared while detail data is pending');
    const geometry = await page.evaluate(async () => {
      const sample = () => {
        const rect = document.querySelector('main.detail-page .detail-info').getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height,
          footerTop: document.querySelector('.site-footer')?.getBoundingClientRect().top ?? null,
          viewportHeight: innerHeight, viewportWidth: innerWidth };
      };
      let previous;
      for (let frame = 0; frame < 120; frame += 1) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const current = sample();
        if (previous && ['top', 'width', 'height', 'footerTop'].every(key => current[key] === previous[key])) return current;
        previous = current;
      }
      throw new Error('Pending detail panel geometry never settled');
    });
    assert(geometry.height >= geometry.viewportHeight - 136 - 1, 'Pending right panel preserves its full first-screen minimum height');
    if (geometry.viewportWidth > 900) {
      const scene = await page.evaluate(() => window.__artworkFirstPaints.find(value => value.direction === 'open')?.scene?.detailPanel);
      if (scene) {
        assert(Math.abs(geometry.top - scene.top) <= 1, 'Pending right panel keeps the transition top edge');
        assert(Math.abs(geometry.width - scene.width) <= 1, 'Pending right panel keeps the transition width');
        assert(geometry.height >= scene.height - 1, 'The right panel does not collapse when the transition hands off');
      }
      assert(geometry.footerTop === null || geometry.footerTop >= geometry.viewportHeight - 1, 'Footer does not flash into the first viewport during loading');
    }
    record.pendingPanelGeometry = geometry;
    record.previewWhileDetailPending = true;
  };
  const openGallery = async ({ decoded = true } = {}) => {
    await page.goto(web + '/gallery', { waitUntil: 'domcontentloaded' });
    // The desktop sign-out button is hidden on mobile. The resolved detail
    // link proves authentication without depending on a desktop-only control.
    await page.locator(`.gallery-row-item a[data-artwork-link="${paintingId}"][href="${detailPath}"]`).waitFor({ state: 'attached' });
    await page.locator('.gallery-page[data-gallery-ready="true"]').waitFor();
    record.pageIdentity = { url: page.url(), title: await page.title(), viewport: page.viewportSize() };
    assert.equal(new URL(record.pageIdentity.url).pathname, '/gallery', 'The intended entry route is open');
    assert(record.pageIdentity.title.includes('画廊'), 'The intended gallery title is rendered');
    assert((await page.locator('main.gallery-page[data-gallery-ready="true"]').innerText()).trim(), 'The app has meaningful rendered page content');
    assert.equal(await page.locator('nextjs-portal [role="dialog"], #webpack-dev-server-client-overlay, vite-error-overlay').count(), 0, 'No framework error overlay');
    const source = page.locator(`.gallery-row-item [data-artwork-source="${paintingId}"]`);
    record.previewMetadata = await source.evaluate(node => ({
      title: node.dataset.artworkTitle, author: node.dataset.artworkAuthor, period: node.dataset.artworkPeriod,
    }));
    await source.scrollIntoViewIfNeeded();
    if (decoded) await page.waitForFunction(paintingId => {
      const image = document.querySelector(`.gallery-row-item [data-artwork-source="${paintingId}"] img`);
      return image?.complete && image.naturalWidth > 0;
    }, paintingId);
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  };
  const captureMoving = async direction => {
    if (process.env.ARTWORK_CAPTURE_FRAMES !== '1'
      || !['fast-round-trip', 'slow-detail-read', 'slow-return-daily-read', 'mobile-slow-round-trip', 'clipped-image-title-entry',
        'background-and-image-first-frame', 'background-longer-than-image', 'tablet-landscape-round-trip'].includes(name)) return;
    await startedFlight(direction);
    await page.screenshot({ path: `${output}/${name}-${direction}-moving.png` });
  };
  const openPainting = async () => {
    // The native Link receives a normal left click. Its covering pseudo-element
    // makes the artwork visible without asking Playwright to click the bitmap.
    const link = page.locator(`.gallery-row-item a[data-artwork-link="${paintingId}"]`);
    if (options.touch) await link.tap();
    else await link.click({ noWaitAfter: true });
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
    const link = page.locator(`.detail-page a[data-artwork-return="${paintingId}"]`);
    if (options.touch) await link.tap();
    else await link.click({ noWaitAfter: true });
    await captureMoving('return');
  };
  try {
    await run({ page, record, gate, release, openGallery, openPainting, detailVisible, returnToGallery,
      startedFlight, completedFlight, completedBackground, firstPaint, cleared, animations, resetAnimations, deferredReads, previewVisible });
    const main = (await animations()).filter(animation => animation.id === 'artlive-artwork-frame');
    for (const direction of ['open', 'return']) assert(main.filter(animation => animation.direction === direction).length <= 1, 'Data handoff never starts a second main flight');
    for (const settle of (await animations()).filter(animation => animation.id?.startsWith('artlive-artwork-settle-'))) {
      assert(Number(settle.duration) <= 120, 'Landing geometry correction is short');
    }
    const paints = await page.evaluate(() => window.__artworkFirstPaints);
    // An explicit interruption can remove the transfer before the first RAF;
    // that cancelled transfer has no visible animation frame to inspect.
    for (const value of paints.filter(value => !value.cancelledBeforePaint)) assert(value.movingBitmap && value.movingBitmap.imageCount === 0
      && value.movingBitmap.canvases.length === 1 && value.movingBitmap.canvases.every(canvas => canvas.drawn
        && canvas.width > 0 && canvas.height > 0 && canvas.visibility === 'visible'),
    `${value.direction} never starts a visible animation with an empty or asynchronously loaded bitmap`);
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
    record.browserTimeline = await page.evaluate(() => ({ requests: window.__artworkRequests, clicks: window.__artworkClicks,
      firstPaints: window.__artworkFirstPaints, textDuringVisuals: window.__artworkTextDuringVisuals,
      inputEvents: window.__artworkInputEvents })).catch(() => ({}));
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
    await observed(detail);
    assert.equal(record.calls.filter(call => call.path === detailApi).length, 1, 'The clicked detail read starts before the cold route resolves');
    assert(!detail.released, 'The authoritative detail response is still held independently of the route');
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
    await openGallery(); const route = gate('route:' + detailPath), detail = gate(detailApi); await openPainting(); await startedFlight('open');
    await observed(detail);
    await page.evaluate(() => {
      localStorage.removeItem('artlive.session.token.v1');
      window.dispatchEvent(new StorageEvent('storage', { key: 'artlive.session.token.v1', oldValue: 'ISOLATED_ARTWORK_TRANSITION_FIXTURE', newValue: null }));
    });
    await cleared(); release('route:' + detailPath, route); release(detailApi, detail);
    await page.waitForURL(url => url.pathname === '/login'); await cleared();
    assert.equal(await page.locator('.detail-page [data-artwork-target]').count(), 0, 'Old authenticated target never reappears');
    await page.waitForFunction(path => window.__artworkRequests.some(request => request.path === path && request.abortedAt !== undefined), detailApi);
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
  await scenario('undecoded-image-navigation', {}, async ({ page, openGallery, openPainting, detailVisible, gate, release, cleared, animations }) => {
    const assetPath = painting(90).image.contentUrl;
    await openGallery();
    const image = gate(assetPath), detail = gate(detailApi);
    // A fresh page waits for its images before enabling interaction. Change an
    // already visible source to exercise an undecoded image after that entrance.
    await page.locator(`.gallery-row-item [data-artwork-source="${paintingId}"] img`).evaluate(image => {
      image.src += '?undecoded-source=1';
    });
    await observed(image); await openPainting(); await observed(detail);
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
  await scenario('background-and-image-first-frame', { routeDelayMs: 2500 }, async ({ page, record, openGallery, openPainting, firstPaint, completedFlight, completedBackground, detailVisible, deferredReads, gate, release, cleared }) => {
    await openGallery();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('main.gallery-page[data-gallery-ready="true"] img'))
      .filter(image => { const rect = image.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight; })
      .every(image => image.complete));
    const beforeClick = record.calls.length;
    const sourcePath = painting(90).image.contentUrl;
    const sourceRead = gate(sourcePath);
    await openPainting(); await firstPaint('open');
    await completedFlight('open'); await completedBackground('open');
    assert(record.routes.some(route => route.path === detailPath && route.injectedDelayMs === 2500), 'The real route read was delayed by 2.5 seconds');
    assert.equal(record.calls.filter(call => call.path === detailApi).length, 1, 'The selected artwork data loads while the route code is delayed');
    assert(!record.calls.some(call => call.path.startsWith(detailApi + '/') || call.path === '/api/v1/critic/capability'), 'Dependent insight reads remain deferred while the route is pending');
    const scene = page.locator('[data-artwork-transition-scene]');
    assert(await scene.isVisible(), 'Complete destination background remains while the route is delayed');
    assert(await scene.locator('.detail-artwork').count(), 'The early background includes the real viewer frame layout');
    const decorativeImageReads = record.calls.slice(beforeClick).filter(call => call.path.startsWith('/api/v1/assets/'));
    assert.deepEqual(decorativeImageReads, [], 'The entire decorative capture, background and moving bitmap start without any new media GET, even while a source reread would be blocked');
    record.decorativeImageReads = decorativeImageReads;
    await page.screenshot({ path: `${output}/cold-route-destination-background.png` });
    release(sourcePath, sourceRead);
    await detailVisible(); await cleared(); await deferredReads();
  });
  await scenario('background-longer-than-image', { backgroundDurationMs: 1200 }, async ({ page, record, openGallery, openPainting, firstPaint, completedFlight, completedBackground, detailVisible, gate, release, previewVisible, deferredReads, cleared }) => {
    await openGallery(); const detail = gate(detailApi); await openPainting(); await firstPaint('open');
    await completedFlight('open');
    await page.locator('main.detail-page [data-artwork-preview="true"]').waitFor({ state: 'attached' });
    assert(await page.evaluate(() => window.__artworkLiveAnimations.some(animation => animation.id === 'artlive-artwork-background' && animation.playState === 'running')), 'The mounted detail preview is observed while the independently delayed background is still moving');
    await observed(detail);
    assert.equal(record.calls.filter(call => call.path === detailApi).length, 1, 'Detail data starts during the visual transition without duplicate reads');
    assert(!record.calls.some(call => call.path.startsWith(detailApi + '/') || call.path === '/api/v1/critic/capability'), 'Finishing the image alone does not release dependent insight reads');
    assert.deepEqual(await page.evaluate(() => window.__artworkTextDuringVisuals), [], 'Neither preview heading nor detail loading text appears during the remaining background transition');
    await page.screenshot({ path: `${output}/background-pending-after-image.png` });
    await completedBackground('open'); await observed(detail); await previewVisible(); await deferredReads();
    release(detailApi, detail); await detailVisible(); await cleared();
  });
  await scenario('fast-detail-waits-for-background', { backgroundDurationMs: 1800, generatedText: '快速返回的作品正文必须等背景动画结束才显示。' }, async ({ page, record, openGallery, openPainting, completedFlight, completedBackground, detailVisible, deferredReads, cleared }) => {
    await openGallery();
    const received = page.waitForResponse(response => new URL(response.url()).pathname === detailApi && response.status() === 200);
    await openPainting(); await received; await completedFlight('open');
    await page.locator('main.detail-page .detail-layout[data-artwork-text-ready="false"]').waitFor({ state: 'attached' });
    const read = await page.evaluate(path => window.__artworkRequests.find(request => request.path === path), detailApi);
    assert(read.activeFrames > 0 && read.activeBackgrounds > 0, 'The lightweight detail GET overlaps both image and background animations');
    assert(await page.evaluate(() => window.__artworkLiveAnimations.some(animation => animation.id === 'artlive-artwork-background' && animation.playState === 'running')), 'Fast data arrives while the background is still animating');
    assert.equal(await page.locator('main.detail-page .detail-info').getByText('快速返回的作品正文必须等背景动画结束才显示。', { exact: true }).count(), 0, 'Fast detail data has not committed its body before the visual gate');
    assert.equal(await page.locator('main.detail-page').getByRole('heading', { name: '作品导览', exact: true }).count(), 0, 'Business panels are not mounted ahead of the visual gate');
    assert(!record.calls.some(call => call.path.startsWith(detailApi + '/') || call.path === '/api/v1/critic/capability'), 'Fast detail data does not start insight reads during the transition');
    await page.screenshot({ path: `${output}/fast-data-background-pending.png` });
    await completedBackground('open'); await detailVisible(); await cleared(); await deferredReads();
    assert(await page.locator('main.detail-page .detail-info').getByText('快速返回的作品正文必须等背景动画结束才显示。', { exact: true }).isVisible());
    record.detailReadOverlappedVisuals = true;
  });
  await scenario('detail-cache-reopen', { backgroundDurationMs: 1200, generatedText: '同一会话短期复用的作品资料。' }, async ({ page, record, openGallery, openPainting, completedFlight, completedBackground, detailVisible, returnToGallery, cleared, resetAnimations }) => {
    await openGallery(); await openPainting(); await completedFlight('open'); await completedBackground('open'); await detailVisible(); await cleared();
    const firstReads = record.calls.filter(call => call.path === detailApi).length;
    assert.equal(firstReads, 1, 'The initial prefetch and foreground subscription share one detail GET');
    await returnToGallery(); await completedFlight('return'); await completedBackground('return'); await cleared();
    await resetAnimations(); await openPainting(); await completedFlight('open');
    await page.locator('main.detail-page .detail-layout[data-artwork-text-ready="false"]').waitFor({ state: 'attached' });
    assert.equal(await page.locator('main.detail-page .detail-info').getByText('同一会话短期复用的作品资料。', { exact: true }).count(), 0, 'Cached detail body also waits for the new background transition');
    await completedBackground('open'); await detailVisible(); await cleared();
    assert.equal(record.calls.filter(call => call.path === detailApi).length, firstReads, 'Reopening the same painting within its session TTL does not repeat the detail GET');
    assert.equal(await page.locator('main.detail-page [aria-label="正在读取作品资料"]').count(), 0, 'A cache hit has no post-flight loading skeleton');
    record.cachedReopen = { firstReads, finalReads: record.calls.filter(call => call.path === detailApi).length };
  });
  await scenario('session-switch-rejects-old-detail', { accountAware: true }, async ({ page, record, openGallery, openPainting, completedFlight, detailVisible, gate, release, previewVisible, cleared }) => {
    await openGallery(); const oldDetail = gate(detailApi, { account: 'A' });
    await openPainting(); await observed(oldDetail); await completedFlight('open'); await previewVisible(); await cleared();
    const replacement = page.waitForResponse(response => new URL(response.url()).pathname === detailApi
      && response.request().headers().authorization?.includes('FIXTURE_ACCOUNT_B') && response.status() === 200);
    await page.evaluate(() => {
      localStorage.setItem('artlive.session.token.v1', 'FIXTURE_ACCOUNT_B');
      window.dispatchEvent(new StorageEvent('storage', { key: 'artlive.session.token.v1', oldValue: 'ISOLATED_ARTWORK_TRANSITION_FIXTURE', newValue: 'FIXTURE_ACCOUNT_B' }));
    });
    await replacement; await detailVisible();
    await page.locator('main.detail-page .detail-info h1').filter({ hasText: '新账号作品详情' }).waitFor({ state: 'visible' });
    await page.waitForFunction(path => window.__artworkRequests.some(request => request.path === path && request.abortedAt !== undefined), detailApi);
    release(detailApi, oldDetail);
    await observed({ path: 'old detail response delivery', observed: oldDetail.delivered });
    // Give the delivered old response a chance to run any queued continuation;
    // two rendered frames expose an erroneous stale commit without a fixed sleep.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal((await page.locator('main.detail-page .detail-info h1').innerText()).trim(), '新账号作品详情', 'The old response cannot overwrite the new session');
    assert.equal(await page.getByText('旧账号详情禁止回流', { exact: true }).count(), 0, 'No old-account detail is displayed after switching sessions');
    assert.equal(record.calls.filter(call => call.path === detailApi && call.account === 'A').length, 1);
    assert.equal(record.calls.filter(call => call.path === detailApi && call.account === 'B').length, 1, 'The new session performs its own authorized detail read');
    record.sessionReplacement = { oldResponseReleased: true, oldRequestAborted: true, newAccountDetailVisible: true };
  });
  await scenario('tablet-landscape-round-trip', { viewport: { width: 1180, height: 820 }, touch: true }, async ({ page, openGallery, openPainting, firstPaint, completedFlight, completedBackground, detailVisible, returnToGallery, gate, release, previewVisible, deferredReads, cleared }) => {
    await openGallery(); const detail = gate(detailApi); await openPainting(); await firstPaint('open');
    await completedFlight('open'); await completedBackground('open'); await observed(detail); await previewVisible(); await deferredReads();
    await page.screenshot({ path: `${output}/tablet-background-and-image-ready.png` });
    release(detailApi, detail); await detailVisible(); await cleared();
    await page.evaluate(() => { window.__artworkClockAdvance += 61000; });
    const daily = gate(dailyApi); await returnToGallery(); await firstPaint('return');
    await completedFlight('return'); await completedBackground('return'); await observed(daily);
    assert(!daily.released, 'The return visual completes before the slow daily read');
    assert(await page.locator('[data-artwork-transition-scene]').isVisible(), 'The gallery visual background stays present while gallery readiness is delayed');
    await page.screenshot({ path: `${output}/tablet-return-background-pending.png` });
    release(dailyApi, daily); await cleared();
  });
  await scenario('resize-clears-background', {}, async ({ page, openGallery, openPainting, firstPaint, startedFlight, gate, release, detailVisible, cleared }) => {
    await openGallery(); const route = gate('route:' + detailPath); await openPainting(); await startedFlight('open'); await firstPaint('open');
    await page.setViewportSize({ width: 1180, height: 820 }); await cleared();
    release('route:' + detailPath, route); await detailVisible(); await cleared();
    assert.equal(await page.locator('[data-artwork-transition-scene]').count(), 0, 'Resize cannot leave an old-size background covering the destination');
  });
  for (const control of ['card', 'favorite']) {
    await scenario(`background-click-blocks-old-${control}`, { touch: control === 'favorite', isMobile: control === 'favorite' }, async ({ page, record, openGallery, openPainting, startedFlight, firstPaint, gate, release, detailVisible, cleared }) => {
      await openGallery();
      const secondCard = page.locator(`main.gallery-page[data-gallery-ready="true"] .gallery-row-item [data-artwork-source="${id(91)}"]`);
      const oldControl = secondCard.locator(control === 'card' ? 'a[data-artwork-link]' : 'button.favorite-button');
      const rect = await oldControl.boundingBox();
      assert(rect && rect.width > 0 && rect.height > 0, 'The old gallery control has a real clickable position');
      const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      assert(point.x > 0 && point.x < 1440 && point.y > 72 && point.y < 1000, 'The old control lies in the visible content viewport');
      const route = gate('route:' + detailPath); await openPainting(); await startedFlight('open'); await firstPaint('open');
      assert(await page.evaluate(point => Boolean(document.elementFromPoint(point.x, point.y)?.closest('[data-artwork-transition-scene]')), point), 'The destination background shields the old control coordinate');
      if (control === 'favorite') await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
      await cleared();
      assert(!record.routes.some(route => route.path === `/gallery/${id(91)}`), 'Cancelling the background never navigates to the old second card');
      assert.deepEqual(record.forbidden, [], 'Cancelling the background never submits an old favorite action');
      release('route:' + detailPath, route); await detailVisible(); await cleared();
      assert.equal(new URL(page.url()).pathname, detailPath, 'The originally chosen detail is the only destination');
      record.backgroundClick = { control, pointer: control === 'favorite' ? 'touch' : 'mouse', point, destination: page.url(), oldControlActivated: false };
    });
  }
  await scenario('held-touch-survives-route-handoff', { touch: true, isMobile: true }, async ({ page, record, openGallery, openPainting, firstPaint, completedFlight, completedBackground, gate, release, detailVisible, cleared }) => {
    await openGallery();
    const oldFavorite = page.locator(`main.gallery-page[data-gallery-ready="true"] .gallery-row-item [data-artwork-source="${id(91)}"] button.favorite-button`);
    const rect = await oldFavorite.boundingBox();
    assert(rect, 'The old gallery favorite has a real position');
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const route = gate('route:' + detailPath); await openPainting(); await firstPaint('open');
    assert(await page.evaluate(point => Boolean(document.elementFromPoint(point.x, point.y)?.closest('[data-artwork-transition-scene]')), point));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1, force: 1 }] });
    record.heldTouch = { point, startedAt: await page.evaluate(() => performance.now()) };
    await completedFlight('open'); await completedBackground('open');
    release('route:' + detailPath, route);
    await page.locator('main.detail-page .detail-layout[data-artwork-text-ready="true"]:not([data-artwork-preview])').waitFor({ state: 'attached' });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert(await page.locator('[data-artwork-transition-scene]').isVisible(), 'Natural route/image handoff cannot remove the background during an active touch gesture');
    assert.deepEqual(record.forbidden, [], 'Holding the background never activates old controls');
    record.heldTouch.destinationArrivedWhileHeld = true;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cleared(); await detailVisible();
    record.heldTouch.endedAt = await page.evaluate(() => performance.now());
    assert.equal(new URL(page.url()).pathname, detailPath, 'Releasing the touch preserves the chosen detail route');
    assert.deepEqual(record.forbidden, [], 'The gesture completion never submits the old favorite action');
    await cdp.detach();
  });
  for (const button of ['right', 'middle']) {
    await scenario(`${button}-button-clears-background`, {}, async ({ page, record, openGallery, openPainting, firstPaint, gate, release, detailVisible, cleared }) => {
      await openGallery(); const route = gate('route:' + detailPath); await openPainting(); await firstPaint('open');
      const point = { x: 1420, y: 970 };
      assert(await page.evaluate(point => Boolean(document.elementFromPoint(point.x, point.y)?.closest('[data-artwork-transition-scene]')), point));
      await page.mouse.click(point.x, point.y, { button });
      await page.waitForFunction(() => !document.querySelector('[data-artwork-transition-overlay], [data-artwork-transition-scene]'), undefined, { timeout: 1500 });
      await cleared(); release('route:' + detailPath, route); await detailVisible(); await cleared();
      assert.equal(page.context().pages().length, 1, 'A decorative background cannot open another tab');
      assert.equal(new URL(page.url()).pathname, detailPath, 'Non-primary input preserves the intended route');
      const events = await page.evaluate(() => window.__artworkInputEvents);
      assert(events.some(event => event.type === 'pointerdown' && event.button === (button === 'right' ? 2 : 1) && event.scene),
        'The actual non-primary button was pressed on the background');
      // Removing a non-primary target on pointerdown is a valid safe cleanup;
      // Chromium need not emit auxclick after pointerup reaches a different node.
      const completionEventObserved = events.some(event => event.type === (button === 'right' ? 'contextmenu' : 'auxclick'));
      record.nonPrimaryInput = { button, point, completionEventObserved, clearedWithoutTimeoutFallback: true };
    });
  }
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  report.outcome = report.cases.length > 0 && report.cases.every(test => test.status === 'PASS') ? 'PASS' : 'FAIL';
  await writeFile(`${output}/RESULT.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(`Artwork transition browser checks: ${report.outcome}`);
  if (report.outcome !== 'PASS') process.exitCode = 1;
}
