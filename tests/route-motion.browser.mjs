// Controlled browser fixtures only: no real account, backend, business or model writes.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { newState, responseFor, id, thumbnailUrl } from './fixtures/loading-runtime.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const web = process.env.REVEAL_WEB_URL || 'http://localhost:3000';
const api = process.env.REVEAL_API_URL || 'http://localhost:5000';
for (const value of [web, api]) assert(['localhost', '127.0.0.1'].includes(new URL(value).hostname));
const output = process.env.REVEAL_OUTPUT; assert(output); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.REVEAL_CHROMIUM });
const report = { boundary: 'Isolated browser fixtures; all API requests intercepted. No real login, write, model call or production performance measurement.', cases: [] };
const selected = process.env.REVEAL_CASES?.split(',');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const image = await readFile(new URL('../public/artlive-reference/Bg1.jpg', import.meta.url));

async function scenario(name, options, run) {
  if (selected && !selected.includes(name)) return;
  const record = { name, errors: [], forbidden: [], calls: [] }; report.cases.push(record);
  const state = newState();
  const gates = new Map();
  const context = await browser.newContext({ viewport: { width: options.mobile ? 390 : 1440, height: 1000 },
    reducedMotion: options.reduced ? 'reduce' : 'no-preference', javaScriptEnabled: options.javascript !== false, serviceWorkers: 'block' });
  if (!options.anonymous) await context.addInitScript(() => localStorage.setItem('artlive.session.token.v1', 'ISOLATED_REVEAL'));
  // Capture actual entrance timings before application code runs.
  await context.addInitScript(() => {
    window.__reveals = [];
    window.__pageEntries = [];
    window.addEventListener('artlive:page-entry', () => window.__pageEntries.push(new Error().stack));
    const animate = Element.prototype.animate;
    Element.prototype.animate = function(frames, timing) {
      const result = animate.call(this, frames, timing);
      if (Array.isArray(frames) && frames[0]?.translate === '0 20px') {
        window.__reveals.push({ get id() { return result.id; }, path: location.pathname, top: this.getBoundingClientRect().top, tag: this.tagName,
          className: this.className, label: this.closest('[data-content-label]')?.dataset.contentLabel,
          communityView: this.closest('.view')?.id, communityMain: !!this.closest('.main-content'), communitySidebar: !!this.closest('.topbar'),
          paintingId: this.closest('[data-painting-id]')?.dataset.paintingId, frames, timing });
      }
      return result;
    };
  });
  const gate = (path, query) => { const value = { seen: deferred(), release: deferred() }; gates.set(query === undefined ? path : path+':'+query, value); return value; };
  const seen = async value => {
    let timer;
    try { await Promise.race([value.seen.promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Held request not observed')), 15000); })]); }
    finally { clearTimeout(timer); }
  };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const held = gates.get(url.pathname+':'+url.searchParams.get('q')) || gates.get(url.pathname) || [...gates].find(([path]) => path.endsWith('*') && url.pathname.startsWith(path.slice(0, -1)))?.[1];
    if (held) { held.seen.resolve(); await held.release.promise; }
    if (url.origin === api) {
      record.calls.push({ path: url.pathname, method, query: url.search });
      const headers = { 'access-control-allow-origin': web, 'access-control-allow-methods': 'GET,HEAD,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', 'cache-control': 'no-store' };
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (options.brokenImage && url.pathname === thumbnailUrl(id(1091))) return route.fulfill({ status: 404, headers });
      const metric = url.pathname.match(/^\/api\/v1\/knowledge\/painting-statistics\/([^/]+)$/);
      const q = url.searchParams.get('q') || '', pageNumber = Number(url.searchParams.get('page') || 0), size = Number(url.searchParams.get('size') || 12);
      const total = q === '无结果' ? 0 : metric?.[1] === 'geography' && state.metricPages ? 201 : 1;
      const result = metric ? { status: state.fail[url.pathname] || 200, contentType: 'application/json', body: state.fail[url.pathname] ? {message:'隔离读取失败'} : {
        schemaVersion: 1, metric: metric[1], items: Array.from({length:Math.max(0,Math.min(size,total-pageNumber*size))}, (_,index)=>({name:(q||'隔离统计')+(pageNumber*size+index+1),value:2})),
        page: pageNumber, size, totalItems: total, totalPages: Math.ceil(total/size), hasMore: (pageNumber+1)*size<total, revision: 'isolated' } }
        : responseFor(state, method, url, null);
      if (url.pathname.startsWith('/api/v1/assets/')) return route.fulfill({ status: 200, headers, contentType: 'image/jpeg', body: image });
      try { await route.fulfill({ status: result.status, headers, contentType: result.contentType,
        body: typeof result.body === 'string' || Buffer.isBuffer(result.body) ? result.body : JSON.stringify(result.body) }); } catch {}
      return;
    }
    if (url.origin === web && url.pathname.startsWith('/api/community/v2/')) {
      const path = url.pathname.replace('/api/community/v2', '');
      record.calls.push({ path, method, query: url.search });
      let data = {};
      if (path === '/api/user/profile') data = { id: 42, username: 'isolated', nickname: '隔离社区', role: 'user', avatar: '', createTime: '2026-11-12 00:00:00' };
      else if (path === '/api/coins/wallet') data = { balance: 0, roomSpendable: 0 };
      else if (path === '/api/notifications') data = { unread: 0, items: [] };
      else if (path === '/api/tags') data = state.communityTags || [];
      else if (path === '/api/posts') data = { items: held?.posts || state.communityPosts || [], total: state.communityPosts?.length || 0, page: 1, pageSize: 12 };
      else if (/^\/api\/posts\/\d+$/.test(path)) data = {post:{...state.communityPosts[0],id:Number(path.split('/').pop())},comments:[]};
      else if (path === '/api/search') data = { posts: (state.communityPosts || []).map(post=>({...post,content:'筛选结果 '+url.searchParams.get('q')})), users: [], hasMore:false };
      else if (path.startsWith('/api/v2/rooms')) data = { items: [], total: 0 };
      else if (path === '/api/coins/tasks') data = {wallet:{balance:0,lifetimeEarned:0,lifetimeSpent:0},items:[]};
      else if (path === '/api/coins/ledger') data = {items:[]};
      else if (path === '/api/coins/room-income') data = {pending:0,settled:0};
      else if (path === '/api/notifications/read') data = {};
      else if (path !== '/api/media-session') record.forbidden.push({ path, method });
      if(state.communityFail?.[path])return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'隔离模块读取失败'})});
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 200, data }) });
    }
    if(url.origin===web&&url.pathname==='/__reveal-image.jpg')return route.fulfill({contentType:'image/jpeg',body:image});
    if (url.origin === web && method === 'GET') return route.continue();
    if (url.hostname === 'res.wx.qq.com') return route.fulfill({ contentType: 'application/javascript', body: '' });
    record.forbidden.push({ path: url.pathname, method }); await route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  if (options.fastDeadline) { await page.clock.install(); await page.clock.resume(); }
  page.on('pageerror', error => record.errors.push(error.message));
  const go = path => page.goto(web + path, { waitUntil: 'domcontentloaded' });
  const ready = async () => {
    await page.locator('.route-content[data-route-phase="ready"]').waitFor({ state: 'attached', timeout: 35000 });
    const path = new URL(page.url()).pathname;
    if (path === '/gallery') {
      await page.locator('main[data-gallery-ready="true"]').waitFor();
      await page.locator('[data-content-label="画廊结果"][data-content-phase="ready"]').waitFor();
    }
    if (path === '/knowledge') {
      await page.locator('[data-content-label="国画统计概览"][data-content-phase="ready"]').waitFor();
      await page.waitForFunction(() => {
        const panel = document.querySelector('#knowledge-paintings');
        return panel?.querySelector('canvas') && !panel.querySelector('[aria-busy="true"], [data-page-ready="false"], [data-content-phase="preparing"], [data-content-phase="entering"]');
      });
    }
    if (path === '/community') {
      await page.getByTestId('community-v2').locator('.view:not(.hidden)[data-content-phase="ready"]').waitFor();
    }
  };
  const hidden = async () => {
    // A production hydration can replace the SSR node between locator resolution
    // and evaluation. Inspect the current connected root after styles apply.
    await page.waitForFunction(() => {
      const element = document.querySelector('.route-content');
      return element?.dataset.routePhase === 'preparing' && getComputedStyle(element).opacity === '0';
    });
    const observed = await page.evaluate(() => { const element = document.querySelector('.route-content'); return { phase: element.dataset.routePhase,
      opacity: getComputedStyle(element).opacity, visibility: getComputedStyle(element).visibility,
      ariaHidden: element.getAttribute('aria-hidden'), inert: element.inert }; });
    assert.equal(observed.phase, 'preparing'); assert.equal(observed.opacity, '0'); assert.equal(observed.visibility, 'hidden');
    assert(observed.ariaHidden === null || observed.ariaHidden === 'true');
    assert(await page.locator('body > .topbar').isVisible(), 'Navigation remains usable');
    return observed;
  };
  try {
    await run({ page, state, gate, seen, go, ready, hidden, record, context });
    assert.deepEqual(record.errors, []); assert.deepEqual(record.forbidden, []); assert.equal(state.writes.length, 0);
    record.status = 'PASS';
  } catch (error) {
    record.status = 'FAIL'; record.error = error.stack;
    record.presentation = await page.evaluate(() => ({ entries:window.__pageEntries, route:document.querySelector('.route-content')?.outerHTML.slice(0,250),
      community:document.querySelector('[data-testid="community-v2"]')?.shadowRoot?.querySelector('#search-input')?.outerHTML,
      parents:(()=>{let n=document.querySelector('[data-testid="community-v2"]')?.shadowRoot?.querySelector('#search-input'),result=[];while(n){result.push({tag:n.tagName,cls:n.className,phase:n.dataset?.contentPhase,display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility});n=n.parentElement;}return result;})() })).catch(()=>null);
    record.pending = await page.locator('[data-page-ready="false"], [data-gallery-ready="false"], [aria-busy="true"], .loading-status').evaluateAll(nodes => nodes.map(node => ({ tag: node.tagName, className: node.className, text: node.textContent.slice(0, 80) }))).catch(() => []);
    await page.screenshot({ path: `${output}/${name}-failure.png` }).catch(() => {});
  } finally {
    for (const value of gates.values()) value.release.resolve();
    await context.close();
    await writeFile(`${output}/RESULT.json`, JSON.stringify(report, null, 2));
    console.log(`${record.status} ${name}${record.error ? ': ' + record.error.split('\n')[0] : ''}`);
  }
}

try {
  await scenario('gallery-shell-and-cards-survive-slow-daily-and-image', {}, async ({ page, gate, seen, go, record }) => {
    const list = gate('/api/v1/paintings');
    const daily = gate('/api/v1/paintings/daily');
    const image = gate(thumbnailUrl(id(1091)));
    await go('/gallery'); await seen(list); await seen(daily);
    const gallery = page.locator('main[data-gallery-ready]');
    const heading = gallery.getByRole('heading', { name: '笔墨之间，自有天地' });
    const search = gallery.getByRole('searchbox', { name: '关键词', exact: true });
    assert(await heading.isVisible(), 'The gallery heading is visible before either API responds');
    assert(await search.isEditable(), 'The filter is usable while requests are in flight');
    await gallery.getByRole('status').filter({ hasText: '正在读取画作目录' }).waitFor();
    await page.screenshot({ path: `${output}/gallery-shell.png` });
    list.release.resolve(); await seen(image);
    const title = page.getByRole('heading', { name: '隔离画作 2', exact: true });
    await title.waitFor({ timeout: 5000 });
    assert(await gallery.getByRole('status').filter({ hasText: '正在选择今日画作' }).isVisible());
    assert(await page.locator(`.gallery-row-item[data-painting-id="${id(91)}"] img`).evaluate(img => !img.complete));
    record.animations = await page.evaluate(() => window.__reveals);
    assert(record.animations.some(item => item.id === 'artlive-content-reveal' && item.label === '画廊结果'));
    await page.screenshot({ path: `${output}/gallery-progressive.png` });
    daily.release.resolve(); image.release.resolve();
    await page.getByRole('heading', { name: '每日隔离山水' }).waitFor();
  });
  await scenario('gallery-result-staggers-and-filters-locally', {}, async ({ page, go, ready, record }) => {
    await go('/gallery'); await ready();
    record.animations = await page.evaluate(() => window.__reveals.filter(item => item.label === '画廊结果'));
    const groups = record.animations;
    assert(groups.every(group => group.frames[0].opacity === 0 && group.frames[1].translate === '0 0'));
    assert(groups.some(group => group.timing.delay > 0));
    assert(groups.every(group => group.timing.duration === 500 && group.timing.delay <= 480));
    for (let index = 1; index < groups.length; index++) assert(groups[index].timing.delay >= groups[index - 1].timing.delay);
    await ready(); assert.equal(await page.locator('.route-content').getAttribute('aria-hidden'), null);
    assert(await page.locator('.route-content').evaluate(element => !element.inert));
    await page.screenshot({ path: `${output}/gallery-ready.png` });
    // Same-page filtering must not restart the whole entrance.
    await page.getByRole('searchbox', { name: '关键词', exact: true }).fill('新查询');
    await page.getByRole('button', { name: '检索画作', exact: true }).click();
    await page.getByRole('heading', { name: '新查询 1', exact: true }).waitFor();
    assert(await page.evaluate(() => window.__reveals.every(item => item.id === 'artlive-content-reveal')));
    assert(await page.evaluate(count => window.__reveals.filter(item => item.label === '画廊结果').length > count, groups.length));
  });
  await scenario('gallery-offscreen-images-stay-lazy', { mobile: true }, async ({ page, gate, seen, go, ready }) => {
    const held = gate(thumbnailUrl(id(1101)));
    await go('/gallery'); await ready();
    const image = page.locator('.gallery-row-item img').last();
    assert.equal(await image.getAttribute('loading'), 'lazy');
    await image.scrollIntoViewIfNeeded(); await seen(held);
    assert(await page.getByRole('heading', { name: '隔离画作 12', exact: true }).isVisible());
    held.release.resolve();
    await page.waitForFunction(() => [...document.querySelectorAll('.gallery-row-item img')].at(-1)?.naturalWidth > 0);
  });
  await scenario('slow-gallery-data-shows-local-retry', { fastDeadline: true }, async ({ page, gate, seen, go, ready }) => {
    const held = gate('/api/v1/paintings'); await go('/gallery'); await seen(held);
    await page.clock.fastForward(11000); await page.clock.resume();
    assert(await page.getByRole('searchbox', { name: '关键词', exact: true }).isEditable());
    await page.getByRole('region', { name: '正在读取画作目录' }).getByRole('button', { name: '重新读取' }).waitFor();
    assert.equal(await page.locator('.gallery-row-item').count(), 0);
    held.release.resolve(); await ready();
  });
  await scenario('failure-shows-settled-error', {}, async ({ page, state, go, ready }) => {
    state.fail['/api/v1/paintings'] = 503; await go('/gallery'); await ready();
    assert(await page.getByRole('heading', { name: '画作目录加载失败' }).isVisible());
  });
  await scenario('gallery-daily-retry-keeps-visible-results', {}, async ({ page, state, go, ready, record }) => {
    state.fail['/api/v1/paintings/daily'] = 503;
    await go('/gallery'); await ready();
    await page.getByRole('heading', { name: '每日推荐暂不可用' }).waitFor();
    const result = page.getByRole('heading', { name: '隔离画作 2', exact: true });
    assert(await result.isVisible());
    const catalogReads = () => record.calls.filter(call => call.path === '/api/v1/paintings' && call.method === 'GET').length;
    const count = catalogReads();
    delete state.fail['/api/v1/paintings/daily'];
    await page.getByRole('button', { name: '重新读取推荐' }).click();
    await page.getByRole('heading', { name: '每日隔离山水' }).waitFor();
    assert(await result.isVisible());
    assert.equal(catalogReads(), count);
  });
  await scenario('broken-image-fallback-does-not-block', { brokenImage: true }, async ({ page, go, ready }) => {
    await go('/gallery'); await ready(); await page.locator('.gallery-row-item .media-fallback').first().waitFor();
  });
  await scenario('rapid-navigation-discards-old-wait', {}, async ({ page, gate, seen, go, ready, record }) => {
    const held = gate('/api/v1/paintings');
    await go('/about'); await ready();
    await page.locator('.primary-nav a[href="/gallery"]').click();
    await seen(held); await page.waitForURL('**/gallery');
    await page.getByRole('heading', { name: '笔墨之间，自有天地' }).waitFor();
    await page.locator('.primary-nav a[href="/about"]').click(); await page.waitForURL('**/about'); await ready();
    held.release.resolve();
    record.reveals = await page.evaluate(() => window.__reveals.map(({ path, label }) => ({ path, label })));
    assert(!record.reveals.some(item => item.label === '画廊结果'));
    assert.equal(await page.locator('.route-content').getAttribute('data-route-path'), '/about');
    assert.equal(await page.locator('.gallery-row-item').count(), 0);
  });
  await scenario('refresh-restarts-entrance', {}, async ({ page, go, ready }) => {
    await go('/login'); await ready(); await page.reload({ waitUntil: 'domcontentloaded' }); await ready();
    assert(await page.evaluate(() => window.__reveals.length > 1));
  });
  await scenario('mobile-reduced-motion-shows-shell', { reduced: true, mobile: true }, async ({ page, gate, seen, go, ready }) => {
    const held = gate('/api/v1/paintings'); await go('/gallery'); await seen(held);
    assert(await page.getByRole('searchbox', { name: '关键词', exact: true }).isEditable());
    await page.locator('main[data-gallery-ready]').getByRole('status').filter({ hasText: '正在读取画作目录' }).waitFor();
    await page.screenshot({ path: `${output}/gallery-mobile-shell.png` });
    held.release.resolve(); await ready(); assert.equal(await page.evaluate(() => window.__reveals.length), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  });
  await scenario('home-waits-for-background', {}, async ({ page, gate, seen, go, hidden, ready }) => {
    const held = gate('/artlive-reference/Bg1.jpg'); await go('/'); await seen(held); await hidden();
    held.release.resolve(); await ready();
  });
  await scenario('server-first-paint-is-hidden', { anonymous: true }, async ({ page, gate, hidden, ready }) => {
    const scripts = gate('/_next/static/chunks/*');
    await page.goto(web+'/login', { waitUntil: 'commit' });
    await page.locator('.route-content').waitFor({ state: 'attached' });
    await hidden(); scripts.release.resolve(); await ready();
  });
  for (const [name, path] of [['home', '/'], ['login', '/login'], ['about', '/about'], ['gallery', '/gallery']]) {
    await scenario(`no-javascript-${name}-remains-accessible`, { anonymous: true, javascript: false }, async ({ page, go }) => {
      await go(path);
      assert(await page.getByRole('main').isVisible());
      assert(await page.getByRole('main').getByRole('heading').first().isVisible());
      assert.equal(await page.locator('.route-content').getAttribute('aria-hidden'), null);
      for (const region of await page.getByRole('main').locator('.content-reveal-region').all()) {
        assert.equal(await region.getAttribute('aria-hidden'), null);
        assert(await region.isVisible());
      }
    });
  }
  await scenario('timeout-keeps-partial-content-hidden', { fastDeadline: true }, async ({ page, gate, seen, go, ready }) => {
    const held = gate('/api/v1/workflow/node-types'); await go('/studio'); await seen(held);
    await page.clock.fastForward(31000); await page.clock.resume();
    await page.getByRole('heading', { name: '页面暂未准备完成' }).waitFor();
    assert.equal(await page.locator('.route-content').getAttribute('data-route-phase'), 'error');
    held.release.resolve();
    await page.setViewportSize({ width: 1200, height: 900 });
    assert.equal(await page.locator('.route-content').getAttribute('data-route-phase'), 'error');
    await page.locator('.primary-nav a[href="/about"]').click(); await page.waitForURL('**/about'); await ready();
    assert.equal(await page.locator('.route-preparation-error').count(), 0);
  });
  for (const mobile of [false, true]) await scenario(`community-shell-before-first-feed-${mobile?'mobile':'desktop'}`, { mobile }, async ({ page, gate, seen, go }) => {
    const profile = gate('/api/user/profile');
    const template = gate('/community-v2/template.html');
    const posts = gate('/api/community/v2/api/posts');
    await go('/community'); await seen(profile);
    assert(await page.getByRole('main').getByRole('heading', { level: 1 }).isVisible());
    assert.equal(await page.getByTestId('community-v2').count(), 0);
    profile.release.resolve(); await seen(template);
    assert(await page.getByRole('main').getByRole('heading', { level: 1 }).isVisible());
    template.release.resolve(); await seen(posts);
    const host = page.getByTestId('community-v2');
    await host.locator(mobile ? '#community-menu' : '.topbar').waitFor();
    await host.getByRole('status').filter({ hasText: '正在读取当前栏目' }).waitFor();
    if (mobile) await host.locator('#community-menu').click();
    assert(await host.locator('.topbar [data-view="rooms"]').isEnabled());
    if (mobile) await host.locator('#community-menu').press('Escape');
    assert.equal(await host.locator('#view-home').evaluate(node => getComputedStyle(node).visibility), 'hidden');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/community-first-feed-${mobile?'mobile':'desktop'}-pending.png` });
    posts.release.resolve(); await host.locator('#view-home[data-content-phase="ready"]').waitFor();
    assert.equal(await host.getByRole('status').filter({ hasText: '正在读取当前栏目' }).count(), 0);
  });
  await scenario('community-startup-failure-shows-retry', {}, async ({ page, state, go }) => {
    state.communityFail = { '/api/user/profile': true };
    await go('/community');
    await page.getByRole('heading', { name: '社区加载失败' }).waitFor();
    assert(await page.getByRole('button', { name: '重新加载' }).isVisible());
    assert(!await page.getByTestId('community-v2').isVisible());
  });
  await scenario('knowledge-independent-metrics-and-charts', {}, async ({ page, gate, seen, go, ready }) => {
    const held = gate('/api/v1/knowledge/painting-statistics/category');
    await go('/knowledge'); await seen(held);
    await page.locator('[data-knowledge-metric="sentiment"] canvas').waitFor();
    assert(await page.getByRole('tab', { name: '国画统计' }).isVisible());
    held.release.resolve(); await ready();
    assert(await page.locator('.knowledge-chart canvas').count() >= 2);
    assert.equal(await page.locator('.knowledge-chart[data-page-ready="false"]').count(), 0);
  });
  await scenario('knowledge-shell-and-counts-before-slow-metric', { mobile: true }, async ({ page, gate, seen, go }) => {
    const profile = gate('/api/user/profile');
    const statistics = gate('/api/v1/knowledge/painting-statistics');
    const category = gate('/api/v1/knowledge/painting-statistics/category');
    await go('/knowledge'); await seen(profile);
    await page.getByRole('main').getByRole('heading', { level: 1 }).waitFor({ timeout: 3000 });
    assert(await page.getByRole('button', { name: '国画统计' }).isDisabled());
    profile.release.resolve(); await seen(statistics);
    assert(await page.getByRole('tab', { name: '诗词图谱' }).isEnabled());
    assert(await page.getByRole('status').filter({ hasText: '正在读取画作统计' }).isVisible());
    statistics.release.resolve(); await seen(category);
    await page.getByText('国画作品数', { exact: true }).waitFor({ timeout: 3000 });
    await page.getByRole('status').filter({ hasText: '正在读取作品分类' }).waitFor();
    await page.screenshot({ path: `${output}/knowledge-first-metric-pending.png` });
    await page.getByRole('tab', { name: '诗词图谱' }).click();
    await page.getByRole('heading', { name: '诗词关系' }).waitFor();
    category.release.resolve();
    assert(await page.getByRole('tab', { name: '诗词图谱', selected: true }).isVisible());
  });
  for(const mobile of [false,true])await scenario(`community-sidebar-only-${mobile?'mobile':'desktop'}`, {mobile}, async ({page,gate,seen,go,ready,record})=>{
    await go('/community');await ready();
    const host=page.locator('[data-testid="community-v2"]'),scope=host.locator('#view-rooms'),sidebar=host.locator('.topbar');
    const before=await sidebar.boundingBox();await page.evaluate(()=>window.__reveals=[]);
    const held=gate('/api/community/v2/api/v2/rooms/public');
    if(mobile)await host.locator('#community-menu').click();
    await host.locator('.nav-link[data-view="rooms"]').click();await seen(held);
    assert.equal(await page.locator('.route-content').getAttribute('data-route-phase'),'ready');
    assert.equal(await scope.evaluate(e=>getComputedStyle(e).visibility),'hidden');
    assert(await host.locator(mobile?'#community-menu':'.topbar').isVisible());
    if(mobile)assert.equal(await host.locator('#community-menu').getAttribute('aria-expanded'),'false');
    else assert.deepEqual(await sidebar.boundingBox(),before);
    assert(await host.locator('.nav-link[data-view="rooms"]').evaluate(e=>e.classList.contains('active')));
    held.release.resolve();await host.locator('#view-rooms[data-content-phase="ready"]').waitFor();
    const animations=await page.evaluate(()=>window.__reveals);assert(animations.length>0);
    assert(animations.every(a=>a.id==='artlive-content-reveal'&&a.communityMain&&!a.communitySidebar&&a.communityView==='view-rooms'));
    record.animations=animations;assert.equal(await page.evaluate(()=>window.__pageEntries.length),0);
    await page.screenshot({path:`${output}/community-sidebar-${mobile?'mobile':'desktop'}.png`});
  });
  await scenario('community-sidebar-all-modules',{},async({page,go,ready})=>{
    await go('/community');await ready();const host=page.locator('[data-testid="community-v2"]');
    await page.evaluate(()=>window.__reveals=[]);
    for(const view of ['create','mine','favorites','coins','notifications','tags','home']){
      await host.locator(`.nav-link[data-view="${view}"]`).click();
      await host.locator(`#view-${view}[data-content-phase="ready"]`).waitFor();
      assert(await host.locator('.topbar').isVisible());assert.equal(await page.locator('.route-content').getAttribute('data-route-phase'),'ready');
    }
    assert(await page.evaluate(()=>window.__reveals.length>0&&window.__reveals.every(a=>a.id==='artlive-content-reveal'&&a.communityMain&&!a.communitySidebar)));
  });
  await scenario('community-favorites-waits-for-image',{},async({page,state,gate,seen,go,ready})=>{
    await go('/community');await ready();const host=page.locator('[data-testid="community-v2"]');
    state.communityPosts=[{id:7,author:{id:42,username:'isolated',nickname:'隔离社区'},content:'收藏图片',images:[web+'/__reveal-image.jpg'],tags:[],createTime:'2026-11-12 00:00:00'}];
    const image=gate('/__reveal-image.jpg');await host.locator('.nav-link[data-view="favorites"]').click();await seen(image);
    assert.equal(await host.locator('#view-favorites').evaluate(e=>getComputedStyle(e).opacity),'0');assert(await host.locator('.topbar').isVisible());
    image.release.resolve();await host.locator('#view-favorites[data-content-phase="ready"]').waitFor();
    assert(await host.locator('#favorite-feed img').evaluateAll(nodes=>nodes.length>0&&nodes.every(e=>e.complete&&e.naturalWidth>0)));
  });
  await scenario('community-sidebar-rapid-and-repeated-navigation',{},async({page,gate,seen,go,ready})=>{
    await go('/community');await ready();const host=page.locator('[data-testid="community-v2"]');
    const post=content=>({id:7,author:{id:42,username:'isolated',nickname:'隔离社区'},content,images:[],tags:[],createTime:'2026-11-12 00:00:00'});
    const old=gate('/api/community/v2/api/posts');old.posts=[post('旧收藏')];
    await host.locator('.nav-link[data-view="favorites"]').click();await seen(old);
    await host.locator('.nav-link[data-view="create"]').click();await host.locator('#view-create[data-content-phase="ready"]').waitFor();
    const latest=gate('/api/community/v2/api/posts');latest.posts=[post('新收藏')];
    await host.locator('.nav-link[data-view="favorites"]').click();await seen(latest);
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/community/v2/api/posts');old.release.resolve();await(await response).finished();
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    assert.equal(await host.locator('#view-favorites').evaluate(e=>getComputedStyle(e).opacity),'0');
    assert.equal(await host.getByText('旧收藏',{exact:true}).count(),0);
    const repeated=gate('/api/community/v2/api/posts');repeated.posts=[post('最终收藏')];
    await host.locator('.nav-link[data-view="favorites"]').click();await seen(repeated);
    const lateResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/community/v2/api/posts');latest.release.resolve();await(await lateResponse).finished();
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    assert.equal(await host.locator('#favorite-feed').getByText('新收藏',{exact:true}).count(),0);
    assert.equal(await host.locator('#view-favorites').evaluate(e=>getComputedStyle(e).visibility),'hidden');
    repeated.release.resolve();await host.locator('#view-favorites[data-content-phase="ready"]').waitFor();
    assert(await host.getByText('最终收藏',{exact:true}).isVisible());assert.equal(await page.locator('.route-content').getAttribute('data-route-phase'),'ready');
  });
  await scenario('community-sidebar-error-and-timeout-recovery',{fastDeadline:true},async({page,state,gate,seen,go,ready})=>{
    await go('/community');await ready();const host=page.locator('[data-testid="community-v2"]');
    state.communityFail={'/api/posts':true};await host.locator('.nav-link[data-view="favorites"]').click();await host.locator('#view-favorites[data-content-phase="ready"]').waitFor();
    assert(await host.locator('#favorite-feed').getByText('隔离模块读取失败',{exact:true}).isVisible());state.communityFail={};
    await host.locator('.nav-link[data-view="create"]').click();await host.locator('#view-create[data-content-phase="ready"]').waitFor();
    const held=gate('/api/community/v2/api/posts');await host.locator('.nav-link[data-view="favorites"]').click();await seen(held);
    await page.clock.fastForward(31000);await page.clock.resume();await host.getByRole('alert').filter({hasText:'内容暂未准备完成'}).waitFor();
    assert(await host.locator('.topbar').isVisible());assert.equal(await page.locator('.route-preparation-error').count(),0);
    await host.locator('.nav-link[data-view="create"]').click();await host.locator('#view-create[data-content-phase="ready"]').waitFor();
    held.release.resolve();await host.locator('.nav-link[data-view="favorites"]').click();await host.locator('#view-favorites[data-content-phase="ready"]').waitFor();
    assert(await host.locator('#view-favorites').isVisible());assert.equal(await host.getByRole('alert').filter({hasText:'内容暂未准备完成'}).count(),0);
  });
  await scenario('community-deep-refresh-keeps-sidebar-usable',{},async({page,gate,seen,go,ready})=>{
    const held=gate('/api/community/v2/api/posts');await go('/community?view=favorites');await seen(held);
    const host=page.getByTestId('community-v2');await host.locator('.topbar').waitFor();
    assert.equal(await host.locator('#view-favorites').evaluate(node=>getComputedStyle(node).visibility),'hidden');
    held.release.resolve();await ready();assert(await host.locator('#view-favorites').isVisible());
  });
  await scenario('community-detail-local-readiness-and-cancel',{},async({page,state,gate,seen,go,ready})=>{
    state.communityPosts=[{id:7,author:{id:42,username:'isolated',nickname:'隔离社区'},content:'详情内容',images:[],tags:[],likeCount:0,coinCount:0,commentCount:0,createTime:'2026-11-12 00:00:00'}];
    await go('/community');await ready();const host=page.locator('[data-testid="community-v2"]');await page.evaluate(()=>window.__reveals=[]);
    const old=gate('/api/community/v2/api/posts/7');await host.locator('#feed [data-post="7"]').click();await seen(old);
    assert.equal(await host.locator('#view-detail').evaluate(e=>getComputedStyle(e).visibility),'hidden');assert(await host.locator('.topbar').isVisible());
    await host.locator('.nav-link[data-view="create"]').click();await host.locator('#view-create[data-content-phase="ready"]').waitFor();
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/community/v2/api/posts/7');old.release.resolve();await(await response).finished();
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));assert.equal(new URL(page.url()).searchParams.get('view'),'create');assert.equal(new URL(page.url()).searchParams.get('post'),null);
    await host.locator('.nav-link[data-view="home"]').click();await host.locator('#view-home[data-content-phase="ready"]').waitFor();
    const latest=gate('/api/community/v2/api/posts/7');await host.locator('#feed [data-post="7"]').click();await seen(latest);
    assert.equal(await host.locator('#view-detail').evaluate(e=>getComputedStyle(e).opacity),'0');latest.release.resolve();await host.locator('#view-detail[data-content-phase="ready"]').waitFor();
    assert(await host.locator('#detail').getByText('详情内容',{exact:true}).isVisible());assert.equal(await page.locator('.route-content').getAttribute('data-route-phase'),'ready');
    assert(await page.evaluate(()=>window.__reveals.every(a=>a.id==='artlive-content-reveal'&&a.communityMain&&!a.communitySidebar)));
    await host.locator('#view-detail .back-button').click();await host.locator('#view-home[data-content-phase="ready"]').waitFor();assert(await host.locator('#feed [data-post="7"]').isVisible());
  });
  await scenario('anonymous-protected-route-never-flashes-content', { anonymous: true }, async ({ page, go, ready }) => {
    await go('/studio'); await page.waitForURL('**/login?**'); await ready();
    assert.equal(await page.locator('.studio-page').count(), 0);
  });
  await scenario('anonymous-progressive-routes-only-show-public-placeholders', { anonymous: true }, async ({ page, go, record }) => {
    for (const path of ['/knowledge', '/community?view=favorites']) {
      await go(path);
      await page.waitForURL(url => url.pathname === '/login' && url.searchParams.get('next') === path);
      assert.equal(await page.getByRole('tab', { name: '国画统计' }).count(), 0);
      assert.equal(await page.getByTestId('community-v2').count(), 0);
    }
    assert(!record.calls.some(call => call.path.startsWith('/api/v1/knowledge/') || call.path === '/api/posts'));
  });
  for (const route of ['studio', 'assistant', 'me', 'knowledge']) await scenario(`authenticated-${route}`, {}, async ({ page, go, ready }) => {
    await go('/'+route); await ready();
    assert.equal(await page.locator('.route-content').getAttribute('data-route-path'), '/'+route);
    if (route === 'knowledge') assert(await page.locator('canvas').count() > 0 || await page.locator('.state-error').count() > 0);
  });
  for (const mobile of [false, true]) await scenario(`module-switch-cache-${mobile?'mobile':'desktop'}`, {mobile}, async ({page,gate,seen,go,ready,record}) => {
    const held=gate('/api/v1/knowledge/poetry-graph');await go('/knowledge');await ready();
    assert(await page.evaluate(()=>window.__reveals.some(item=>item.id==='artlive-content-reveal'&&item.label==='国画统计概览')));
    const routeCount=await page.evaluate(()=>window.__reveals.filter(item=>item.id==='artlive-route-reveal').length);
    await page.getByRole('tab',{name:'诗词图谱'}).click();await seen(held);
    const region=page.getByRole('tabpanel',{name:'诗词图谱'});
    assert(await region.getByRole('status').filter({hasText:'正在读取诗词图谱'}).isVisible());
    assert(await page.locator('.knowledge-tabs').isVisible());assert(await page.locator('.module-header').isVisible());
    const graph=page.locator('[data-content-label="诗词关系图"][data-content-phase="ready"]');
    held.release.resolve();await graph.waitFor();
    const before=await page.evaluate(()=>window.__reveals.length);
    await page.getByRole('tab',{name:'国画统计'}).click();await page.locator('[data-content-label="国画统计概览"][data-content-phase="ready"]').waitFor();
    assert(await page.evaluate(count=>window.__reveals.length>count,before));
    await page.getByRole('tab',{name:'国画统计'}).press('ArrowRight');await page.getByRole('tab',{name:'诗词图谱',selected:true}).waitFor();
    await graph.waitFor();
    assert.equal(record.calls.filter(call=>call.path==='/api/v1/knowledge/poetry-graph').length,1,'Cached module is not refetched');
    assert.equal(await page.evaluate(()=>window.__reveals.filter(item=>item.id==='artlive-route-reveal').length),routeCount);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`${output}/knowledge-module-${mobile?'mobile':'desktop'}.png`});
  });
  await scenario('metric-search-only-reveals-current-result', {}, async ({page,gate,seen,go,ready}) => {
    await go('/knowledge');await ready();
    const count=await page.evaluate(()=>window.__reveals.length),scope=page.locator('[data-content-label="作者地域分布"]');
    const input=page.getByRole('searchbox',{name:'搜索作者地域分布'}),form=page.getByRole('search',{name:'搜索作者地域分布'});
    await input.fill('新查询');assert.equal(await page.evaluate(()=>window.__reveals.length),count,'Draft typing does not start entrance');
    const held=gate('/api/v1/knowledge/painting-statistics/geography','新查询');await form.getByRole('button',{name:'搜索',exact:true}).click();await seen(held);
    assert.equal(await scope.count(),0);assert(await input.isVisible());assert.equal(await input.inputValue(),'新查询');
    assert(await page.locator('[data-knowledge-metric="dynasty"]').isVisible());
    held.release.resolve();await page.locator('[data-content-label="作者地域分布"][data-content-phase="ready"]').waitFor();
    await scope.getByText('新查询1',{exact:true}).waitFor();
    const entries=await page.evaluate(start=>window.__reveals.slice(start).filter(item=>item.id==='artlive-content-reveal'),count);
    assert(entries.length>0 && entries.every(item=>item.label==='作者地域分布'));
  });
  await scenario('metric-latest-request-wins', {}, async ({page,gate,seen,go,ready}) => {
    await go('/knowledge');await ready();const held=gate('/api/v1/knowledge/painting-statistics/geography','旧查询');
    const input=page.getByRole('searchbox',{name:'搜索作者地域分布'}),submit=page.getByRole('search',{name:'搜索作者地域分布'}).getByRole('button',{name:'搜索',exact:true});
    await input.fill('旧查询');await submit.click();await seen(held);
    await input.fill('新查询');await submit.click();await page.locator('[data-content-label="作者地域分布"][data-content-phase="ready"]').waitFor();
    held.release.resolve();await page.getByText('新查询1',{exact:true}).waitFor();assert.equal(await page.getByText('旧查询1',{exact:true}).count(),0);
  });
  await scenario('metric-sort-page-empty-and-error', {}, async ({page,state,go,ready}) => {
    state.metricPages=true;await go('/knowledge');await ready();
    const scope=page.locator('[data-content-label="作者地域分布"]');
    await page.getByRole('combobox',{name:'作者地域分布排序'}).selectOption('name');await page.locator('[data-content-label="作者地域分布"][data-content-phase="ready"]').waitFor();
    await page.getByRole('navigation',{name:'作者地域分布分页'}).getByRole('button',{name:'下一页'}).click();await scope.getByText('隔离统计201',{exact:true}).waitFor();
    const input=page.getByRole('searchbox',{name:'搜索作者地域分布'}),submit=page.getByRole('search',{name:'搜索作者地域分布'}).getByRole('button',{name:'搜索',exact:true});
    await input.fill('无结果');await submit.click();await scope.getByRole('heading',{name:'暂无匹配项目'}).waitFor();
    state.fail['/api/v1/knowledge/painting-statistics/geography']=503;await input.fill('失败');await submit.click();await scope.getByRole('heading',{name:'统计读取失败'}).waitFor();
    delete state.fail['/api/v1/knowledge/painting-statistics/geography'];await scope.getByRole('button',{name:'重新加载'}).click();await scope.getByText('失败1',{exact:true}).waitFor();
  });
  await scenario('local-metric-search-and-sort', {}, async ({page,go,ready}) => {
    await go('/knowledge');await ready();await page.getByRole('tab',{name:'诗词图谱'}).click();await page.locator('[data-content-label="诗词关系图"][data-content-phase="ready"]').waitFor();
    const input=page.getByRole('searchbox',{name:'搜索关系标签'}),scope=page.locator('[data-content-label="关系标签"]');
    await input.fill('不存在');await page.getByRole('search',{name:'搜索关系标签'}).getByRole('button',{name:'搜索',exact:true}).click();await scope.getByRole('heading',{name:'暂无匹配项目'}).waitFor();
    await input.fill('');await scope.getByText('创作',{exact:true}).waitFor();await page.getByRole('combobox',{name:'关系标签排序'}).selectOption('name');await page.locator('[data-content-label="关系标签"][data-content-phase="ready"]').waitFor();
  });
  await scenario('gallery-append-only-new-items', {}, async ({page,gate,seen,go,ready}) => {
    await go('/gallery');await ready();await page.evaluate(()=>{window.__oldGalleryCard=document.querySelector('.gallery-row-item');window.__oldGalleryIds=[...document.querySelectorAll('.gallery-row-item')].map(node=>node.dataset.paintingId);window.__reveals=[];});
    const thumbnail = page.locator(`.gallery-row-item[data-painting-id="${id(113)}"] img`);
    const held = gate(thumbnailUrl(id(1113)));
    await page.getByRole('button', {name:'加载更多画作', exact:true}).click();
    await thumbnail.scrollIntoViewIfNeeded(); await seen(held);
    assert(await page.evaluate(()=>document.querySelector('.gallery-row-item')===window.__oldGalleryCard));
    assert.equal(await page.locator('.gallery-row-item').count(),24);assert(await page.locator('.gallery-row-item').first().isVisible());
    await page.getByRole('button', {name:'加载更多画作', exact:true}).waitFor();
    assert(await thumbnail.evaluate(image => image.loading === 'lazy' && !image.complete));
    await page.waitForFunction(()=>window.__reveals.filter(item=>item.id==='artlive-content-reveal').length>=12);
    assert(await page.evaluate(()=>window.__reveals.every(item=>item.id==='artlive-content-reveal'&&item.paintingId&&!window.__oldGalleryIds.includes(item.paintingId))));
    held.release.resolve();
    await page.waitForFunction(src => [...document.images].some(image => image.src.endsWith(src) && image.naturalWidth > 0), thumbnailUrl(id(1113)));
  });
  await scenario('community-tag-and-latest-search-are-local', {}, async ({page,state,gate,seen,go,ready,record}) => {
    state.communityTags=[{name:'山水',postCount:1}];state.communityPosts=[{id:7,author:{id:42,username:'isolated',nickname:'隔离社区',role:'user'},content:'初始分享',images:[],tags:['山水'],likeCount:0,coinCount:0,commentCount:0,createTime:'2026-11-12 00:00:00'}];
    await go('/community');await ready();const host=page.locator('[data-testid="community-v2"]'),feed=host.locator('#feed');
    const routeCount=await page.evaluate(()=>window.__reveals.filter(item=>item.id==='artlive-route-reveal').length);
    const tag=gate('/api/community/v2/api/search','#山水');await host.locator('#tag-strip [data-tag="山水"]').click();await seen(tag);
    assert.equal(await feed.evaluate(element=>getComputedStyle(element).opacity),'0');assert(await host.locator('#search-input').isVisible());
    tag.release.resolve();await feed.getByText('筛选结果 #山水',{exact:true}).waitFor();await host.locator('#feed[data-content-phase="ready"]').waitFor();
    const old=gate('/api/community/v2/api/search','旧查询');await host.locator('#search-input').fill('旧查询');await seen(old);
    await host.locator('#search-input').fill('新查询');await feed.getByText('筛选结果 新查询',{exact:true}).waitFor();
    const late=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/community/v2/api/search'&&new URL(response.url()).searchParams.get('q')==='旧查询');
    old.release.resolve();await (await late).finished();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await feed.getByText('筛选结果 旧查询',{exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>window.__reveals.filter(item=>item.id==='artlive-route-reveal').length),routeCount);
    assert.equal(record.calls.filter(call=>call.path==='/api/media-session'&&call.method==='POST').length,1);
  });
  await scenario('local-reduced-motion-and-timeout', {reduced:true,fastDeadline:true}, async ({page,gate,seen,go,ready}) => {
    await go('/knowledge');await ready();const held=gate('/api/v1/knowledge/painting-statistics/geography','等待');
    await page.getByRole('searchbox',{name:'搜索作者地域分布'}).fill('等待');await page.getByRole('search',{name:'搜索作者地域分布'}).getByRole('button',{name:'搜索',exact:true}).click();await seen(held);
    await page.clock.fastForward(11000);await page.clock.resume();
    await page.getByRole('region',{name:'正在读取作者地域分布'}).getByRole('button',{name:'重新读取'}).waitFor();
    assert(await page.locator('.knowledge-tabs').isVisible());assert.equal(await page.locator('.route-content').getAttribute('data-route-phase'),'ready');
    held.release.resolve();assert.equal(await page.evaluate(()=>window.__reveals.length),0);
  });
} finally { await browser.close(); }
assert(report.cases.every(item => item.status === 'PASS'), 'See route reveal browser report');
