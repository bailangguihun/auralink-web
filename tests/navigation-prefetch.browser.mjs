// Local rendered behavior with synthetic API fixtures. Never sends real auth or application writes.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { newState, responseFor, painting } from './fixtures/loading-runtime.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
function localOrigin(value) {
  const u = new URL(value); assert.equal(u.protocol, 'http:');
  assert(['localhost', '127.0.0.1'].includes(u.hostname)); return u.origin;
}
const web = localOrigin(process.env.PREFETCH_WEB_URL || 'http://localhost:3000');
const api = localOrigin(process.env.PREFETCH_API_URL || 'http://localhost:5000');
const output = process.env.PREFETCH_BROWSER_OUTPUT; assert(output); await mkdir(output, { recursive: true });
const CATALOG = '/api/v1/paintings', DAILY = `${CATALOG}/daily`;
const STATS = '/api/v1/knowledge/painting-statistics', GRAPH = '/api/v1/knowledge/poetry-graph';
const READS = [CATALOG, DAILY, STATS, GRAPH];
const ASSISTANT_READS = ['/api/v1/assistant/status', '/api/v1/assistant/models', '/api/v1/assistant/sessions/page'];
const report = { boundary: 'Local app; all API responses are synthetic Playwright fixtures. No real login, account, model, stream, or write request. Browser plugin not available.', web, api, mode: process.env.PREFETCH_BUILD_MODE || 'development', cases: [] };
const browser = await chromium.launch({ headless: true });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function scenario(name, options, run) {
  if (process.env.PREFETCH_CASES && !process.env.PREFETCH_CASES.split(',').includes(name)) return;
  const record = { name }; report.cases.push(record);
  const context = await browser.newContext({ viewport: { width: options.width || 1440, height: options.height || 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const fixture = newState();
  const state = { calls: [], rsc: [], forbidden: [], gates: new Map(), imageGate: null, failures: {}, errors: [], console: [], maxPendingReads: 0, maxPendingRsc: 0 };
  await context.addInitScript(({ authenticated, condition }) => {
    if (authenticated) localStorage.setItem('artlive.session.token.v1', 'ISOLATED_NAVIGATION_FIXTURE_A');
    const network = new EventTarget(); network.saveData = false; network.effectiveType = '4g';
    let visibility = 'visible', online = true;
    Object.defineProperty(navigator, 'connection', { configurable: true, get: () => network });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    const idle = new Map(); let next = 0;
    let readinessScans = 0;
    const querySelector = Document.prototype.querySelector;
    Document.prototype.querySelector = function (selector) {
      if (selector === '[data-navigation-page]') readinessScans++;
      return querySelector.call(this, selector);
    };
    window.requestIdleCallback = callback => { const id = ++next; idle.set(id, callback); return id; };
    window.cancelIdleCallback = id => idle.delete(id);
    const set = (kind, enabled) => {
      if (kind === 'hidden') { visibility = enabled ? 'hidden' : 'visible'; document.dispatchEvent(new Event('visibilitychange')); }
      if (kind === 'offline') { online = !enabled; window.dispatchEvent(new Event(enabled ? 'offline' : 'online')); }
      if (kind === 'saveData') { network.saveData = enabled; network.dispatchEvent(new Event('change')); }
      if (kind === 'slowNetwork') { network.effectiveType = enabled ? '3g' : '4g'; network.dispatchEvent(new Event('change')); }
    };
    window.__navigationTest = {
      set,
      readinessScans: () => readinessScans,
      async pump() {
        const callbacks = [...idle.values()]; idle.clear();
        callbacks.forEach(callback => callback({ didTimeout: false, timeRemaining: () => 50 }));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      },
    };
    if (condition) set(condition, true);
  }, options);
  const page = await context.newPage();
  page.on('pageerror', error => state.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') state.console.push({ text: message.text(), url: message.location().url }); });
  const requests = new Map();
  const rscRequests = new Map();
  page.on('requestfinished', request => { const entry = rscRequests.get(request); if (entry) entry.complete = true; });
  page.on('requestfailed', request => { const call = requests.get(request); if (call) { call.aborted = true; call.failure = request.failure()?.errorText; } });
  await context.route('**/*', async route => {
    const request = route.request(), u = new URL(request.url()), method = request.method();
    if (u.origin === web) {
      if (u.searchParams.has('_rsc')) {
        const entry = { path: u.pathname, prefetch: request.headers()['next-router-prefetch'] === '1', complete: false };
        state.rsc.push(entry); rscRequests.set(request, entry);
        state.maxPendingRsc = Math.max(state.maxPendingRsc, state.rsc.filter(r => !r.complete).length);
      }
      await route.continue(); return;
    }
    if (u.href === 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js') { await route.fulfill({ contentType: 'application/javascript', body: '/* inert isolated SDK fixture */' }); return; }
    if (u.origin !== api) { state.forbidden.push({ method, path: u.origin + u.pathname }); await route.abort(); return; }
    const headers = { 'access-control-allow-origin': web, 'access-control-allow-methods': 'GET,HEAD,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', 'cache-control': 'no-store' };
    if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    const call = { method, path: u.pathname, query: u.search, authenticated: Boolean(request.headers().authorization), complete: false, aborted: false };
    state.calls.push(call); requests.set(request, call);
    if (!['GET', 'HEAD'].includes(method) || ![...READS, '/api/user/profile', ...(options.assistant ? ASSISTANT_READS : [])].includes(u.pathname) && !u.pathname.startsWith('/api/v1/assets/')) {
      state.forbidden.push({ method, path: u.pathname }); await route.fulfill({ status: 405, headers, contentType: 'application/json', body: JSON.stringify({ message: 'Unpermitted fixture operation' }) }); return;
    }
    state.maxPendingReads = Math.max(state.maxPendingReads, state.calls.filter(c => READS.includes(c.path) && !c.complete && !c.aborted).length);
    const gate = state.gates.get(u.pathname) || (u.pathname.startsWith('/api/v1/assets/') ? state.imageGate : null);
    if (gate) { gate.observed.resolve(); await gate.promise; }
    let response = responseFor(fixture, method, u, null);
    if (u.pathname === CATALOG) response = { status: 200, contentType: 'application/json', body: {
      items: Array.from({ length: 12 }, (_, i) => ({ ...painting(100 + i, `预取合成画作 ${i + 1}`), favorited: false })),
      page: 0, size: 12, totalPages: 3, totalElements: 36, first: true, last: false, hasNext: true, orderDate: '2026-10-31',
    } };
    if (state.failures[u.pathname]) response = { status: state.failures[u.pathname], contentType: 'application/json', body: { message: 'Synthetic background read failure' } };
    try { await route.fulfill({ status: response.status, headers, contentType: response.contentType, body: typeof response.body === 'object' && !Buffer.isBuffer(response.body) ? JSON.stringify(response.body) : response.body }); }
    catch (error) { if (!call.aborted && !/closed|disposed|handled/.test(String(error))) throw error; }
    call.complete = true;
  });
  const calls = path => state.calls.filter(call => call.path === path);
  const pump = async (count = 1) => { for (let i = 0; i < count; i++) await page.evaluate(() => window.__navigationTest.pump()); };
  const until = async (predicate, description) => {
    const deadline = Date.now() + 45000;
    while (!await predicate()) { assert(Date.now() < deadline, `Timed out: ${description}`); await pump(); }
  };
  const gate = path => { const g = { ...deferred(), observed: deferred() }; state.gates.set(path, g); return g; };
  const release = (path, g) => { state.gates.delete(path); g.resolve(); };
  const navigate = async (href, heading) => {
    // DOM click is intentional: verify automatic work without hover/focus prioritization.
    await page.locator(`#primary-navigation a[href="${href}"]`).evaluate(element => element.click());
    await page.waitForURL(url => url.pathname === href);
    if (heading) await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  };
  const open = async (href = '/') => {
    await page.goto(web + href, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-navigation-page], main').first().waitFor();
    if (options.authenticated) await page.getByRole('button', { name: '退出', exact: true }).waitFor();
  };
  try {
    await run({ page, state, calls, pump, until, gate, release, navigate, open, record });
    assert.deepEqual(state.forbidden, [], 'No hidden mounts, writes, model, stream, or unconfigured API request');
    assert.deepEqual(state.errors, [], 'No JavaScript exception');
    const unexpected = state.console.filter(entry => !/Failed to load resource.*(?:503|401)/.test(entry.text));
    assert.deepEqual(unexpected, [], 'No unexpected console error');
    record.status = 'PASS';
  } catch (error) {
    record.status = 'FAIL'; record.error = error.stack;
    await page.screenshot({ path: `${output}/${name}-failure.png`, fullPage: true }).catch(() => {});
  } finally {
    for (const g of state.gates.values()) g.resolve(); state.imageGate?.resolve();
    record.calls = state.calls; record.rsc = state.rsc; record.forbidden = state.forbidden; record.console = state.console; record.maxPendingReads = state.maxPendingReads; record.maxPendingRsc = state.maxPendingRsc;
    await context.close();
    await writeFile(`${output}/RESULT.json`, JSON.stringify(report, null, 2) + '\n');
    console.log(`${name}: ${record.status}${record.error ? ' ' + record.error.split('\n')[0] : ''}`);
  }
}

try {
  await scenario('anonymous-automatic-public-only', {}, async ({ page, calls, until, pump, open, state, record }) => {
    await open(); await until(() => calls(DAILY).some(c => c.complete), 'automatic gallery and daily reads'); await pump(20);
    assert.equal(calls(CATALOG).length, 1); assert.equal(calls(DAILY).length, 1); assert.equal(calls(STATS).length, 0); assert.equal(calls(GRAPH).length, 0);
    assert.equal(state.maxPendingReads, 1, 'One background JSON request at a time');
    record.automaticWithoutHover = true;
    if (report.mode === 'production') {
      // This case performs no navigation/hover/focus. Its RSC requests are the
      // automatic prefetch, including Next FULL requests without a prefetch header.
      const prefetched = new Set(state.rsc.map(r => r.path));
      for (const route of ['/gallery', '/knowledge', '/studio', '/community', '/assistant', '/about']) assert(prefetched.has(route), `Route code prefetched: ${route}`);
      record.prefetchedRoutes = [...prefetched];
    }
    await page.screenshot({ path: `${output}/anonymous-home.png` });
  });
  await scenario('authenticated-cache-reuse', { authenticated: true }, async ({ page, calls, until, pump, open, navigate, state }) => {
    await open(); await until(() => calls(GRAPH).some(c => c.complete), 'authenticated knowledge warming'); await pump(12);
    for (const path of READS) assert.equal(calls(path).length, 1);
    assert.equal(state.maxPendingReads, 1);
    await navigate('/gallery', '笔墨之间，自有天地'); await page.locator('.gallery-painting-card').first().waitFor(); await pump(4);
    assert.equal(calls(CATALOG).length, 1); assert.equal(calls(DAILY).length, 1);
    await navigate('/knowledge'); await page.getByRole('tabpanel', { name: '国画统计' }).waitFor();
    await page.getByRole('tab', { name: '诗词图谱' }).click(); await page.getByRole('region', { name: '诗词图谱浏览器' }).waitFor(); await pump(4);
    assert.equal(calls(STATS).length, 1); assert.equal(calls(GRAPH).length, 1);
    await page.screenshot({ path: `${output}/cached-knowledge.png` });
  });
  await scenario('foreground-api-and-image-priority', { authenticated: true }, async ({ page, state, calls, gate, release, open, pump, until, record }) => {
    const catalog = gate(CATALOG); state.imageGate = { ...deferred(), observed: deferred() }; const image = state.imageGate;
    await open('/gallery'); await until(() => calls(CATALOG).length === 1, 'foreground catalog requested'); await pump(12);
    assert.equal(calls(STATS).length, 0); assert.equal(calls(GRAPH).length, 0);
    release(CATALOG, catalog); await until(() => state.calls.some(c => c.path.startsWith('/api/v1/assets/')), 'visible image request'); await pump(12);
    assert.equal(calls(STATS).length, 0); assert.equal(calls(GRAPH).length, 0);
    state.imageGate = null; image.resolve(); await until(() => calls(GRAPH).some(c => c.complete), 'knowledge after foreground images');
    record.gates = ['foreground catalog response', 'visible image bytes'];
    await page.screenshot({ path: `${output}/foreground-gallery.png` });
  });
  await scenario('foreground-joins-inflight', { authenticated: true }, async ({ page, calls, gate, release, open, until, navigate, pump }) => {
    const catalog = gate(CATALOG); await open(); await until(() => calls(CATALOG).length === 1, 'background catalog started');
    await navigate('/gallery', '笔墨之间，自有天地'); await pump(5); assert.equal(calls(CATALOG).length, 1, 'Foreground joins background fetch');
    release(CATALOG, catalog); await page.locator('.gallery-painting-card').first().waitFor(); await until(() => calls(GRAPH).some(c => c.complete), 'queue resumed');
    assert.equal(calls(CATALOG).length, 1); assert.equal(calls(CATALOG)[0].aborted, false);
  });
  await scenario('assistant-api-priority-and-unavailable-resume', { authenticated: true, assistant: true }, async ({ page, state, calls, gate, release, open, pump, until }) => {
    const status = gate(ASSISTANT_READS[0]); state.failures[ASSISTANT_READS[0]] = 503;
    await open('/assistant'); await until(() => calls(ASSISTANT_READS[0]).some(c => !c.aborted), 'foreground assistant status'); await pump(12);
    for (const path of READS) assert.equal(calls(path).length, 0, 'Assistant loading blocks background data');
    release(ASSISTANT_READS[0], status); await page.getByRole('heading', { name: '助手暂不可用', exact: true }).waitFor();
    await until(() => calls(GRAPH).some(c => c.complete), 'unavailable terminal state permits background queue');
    assert.equal(calls(ASSISTANT_READS[1]).length, 0); assert.equal(calls(ASSISTANT_READS[2]).length, 0);
  });
  await scenario('assistant-capability-api-priority', { authenticated: true, assistant: true }, async ({ calls, gate, release, open, pump, until }) => {
    const models = gate(ASSISTANT_READS[1]); await open('/assistant'); await until(() => calls(ASSISTANT_READS[1]).length === 1, 'foreground model registry check'); await pump(12);
    for (const path of READS) assert.equal(calls(path).length, 0, 'Capability loading blocks background data');
    release(ASSISTANT_READS[1], models); await until(() => calls(GRAPH).some(c => c.complete), 'completed capability check permits background queue');
    assert.equal(calls(ASSISTANT_READS[2]).length, 1);
  });
  await scenario('mobile-automatic-public-only', { width: 390, height: 844 }, async ({ page, calls, open, pump, until }) => {
    await open(); await until(() => calls(DAILY).some(c => c.complete), 'mobile automatic warming'); await pump(12);
    assert.equal(calls(CATALOG).length, 1); assert.equal(calls(DAILY).length, 1); assert.equal(calls(STATS).length, 0); assert.equal(calls(GRAPH).length, 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/mobile-home.png` });
  });
  await scenario('completed-queue-does-not-scan', {}, async ({ page, calls, open, pump, until, record }) => {
    await open(); await until(() => calls(DAILY).some(c => c.complete), 'public warming'); await pump(24);
    const before = await page.evaluate(() => window.__navigationTest.readinessScans());
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => { window.dispatchEvent(new Event('scroll')); document.body.classList.toggle('navigation-test-idle-mutation'); });
      await pump(2);
    }
    const after = await page.evaluate(() => window.__navigationTest.readinessScans());
    assert.equal(after, before, 'Exhausted queue avoids readiness DOM scans on scroll/mutation');
    record.additionalReadinessScans = after - before;
    assert.equal(calls(CATALOG).length, 1); assert.equal(calls(DAILY).length, 1);
  });
  for (const condition of ['hidden', 'offline', 'saveData', 'slowNetwork']) {
    await scenario(`pause-${condition}`, { condition }, async ({ page, calls, open, pump, until }) => {
      await open(); await pump(12); for (const path of READS) assert.equal(calls(path).length, 0, `Paused for ${condition}`);
      await page.evaluate(kind => window.__navigationTest.set(kind, false), condition);
      await until(() => calls(DAILY).some(c => c.complete), `resumed after ${condition}`); assert.equal(calls(CATALOG).length, 1);
    });
  }
  await scenario('active-hidden-aborts-and-resumes', {}, async ({ page, calls, open, pump, until, gate, release }) => {
    const catalog = gate(CATALOG); await open(); await until(() => calls(CATALOG).length === 1, 'background read');
    await page.evaluate(() => window.__navigationTest.set('hidden', true)); await until(() => calls(CATALOG)[0].aborted, 'cancel hidden read'); await pump(8);
    assert.equal(calls(DAILY).length, 0); release(CATALOG, catalog);
    await page.evaluate(() => window.__navigationTest.set('hidden', false)); await until(() => calls(DAILY).some(c => c.complete), 'resume hidden read'); assert.equal(calls(CATALOG).length, 2);
  });
  await scenario('route-change-cancels-unrelated-read', { authenticated: true }, async ({ calls, open, until, gate, release, navigate, pump }) => {
    const stats = gate(STATS); await open(); await until(() => calls(STATS).length === 1, 'background statistics');
    await navigate('/about'); await until(() => calls(STATS)[0].aborted, 'cancel unrelated route read'); release(STATS, stats);
    await until(() => calls(GRAPH).some(c => c.complete), 'new route queue completes'); await pump(4); assert(calls(STATS).length <= 2);
  });
  await scenario('logout-cancels-private-generation', { authenticated: true }, async ({ page, calls, open, until, gate, release, pump, record }) => {
    const stats = gate(STATS); await open(); await until(() => calls(STATS).length === 1, 'private pending request');
    await page.getByRole('button', { name: '退出', exact: true }).click(); await until(() => calls(STATS)[0].aborted, 'old generation cancelled'); release(STATS, stats);
    await until(() => calls(DAILY).some(c => c.complete && !c.authenticated), 'anonymous generation public warm'); await pump(16);
    assert.equal(calls(GRAPH).length, 0); assert.equal(calls(STATS).length, 1);
    assert.equal(await page.getByRole('button', { name: '退出', exact: true }).count(), 0); record.noPrivateReadAfterLogout = true;
  });
  await scenario('failure-silent-no-background-retry', { authenticated: true }, async ({ page, state, calls, open, until, pump, navigate }) => {
    state.failures[STATS] = 503; await open(); await until(() => calls(GRAPH).some(c => c.complete), 'queue continues after failed speculative read');
    await pump(20); assert.equal(calls(STATS).length, 1); assert.equal(await page.locator('main .state-panel-error, main [role=alert]').count(), 0);
    state.failures[STATS] = 0; await navigate('/knowledge'); await until(() => calls(STATS).some((c, i) => i > 0 && c.complete), 'foreground retries failed read');
    await page.locator('.knowledge-counts').waitFor(); assert.equal(calls(STATS).length, 2);
  });
} finally {
  await browser.close(); report.passed = report.cases.every(record => record.status === 'PASS');
  await writeFile(`${output}/RESULT.json`, JSON.stringify(report, null, 2) + '\n');
}
if (!report.passed) process.exitCode = 1;
