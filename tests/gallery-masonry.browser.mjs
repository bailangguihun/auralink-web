// Rendered Web with isolated API fixtures only; no production writes or auth acceptance.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { newState, responseFor, painting } from './fixtures/loading-runtime.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
function localOrigin(name) {
  const url = new URL(process.env[name]);
  assert.equal(url.protocol, 'http:'); assert.equal(url.hostname, '127.0.0.1');
  return url.origin;
}
const web = localOrigin('GALLERY_WEB_URL'), api = localOrigin('GALLERY_API_URL');
const output = process.env.GALLERY_BROWSER_OUTPUT; assert(output);
await mkdir(output, { recursive: true });
const assets = await Promise.all([
  ['Bg1.jpg', 2048, 2352], ['Bg2.jpg', 2048, 1101], ['Bg3.jpeg', 1600, 1158], ['Bg4.jpg', 2896, 2350],
].map(async ([file, width, height]) => ({ width, height, body: await readFile(new URL(`../public/artlive-reference/${file}`, import.meta.url)) })));
const browser = await chromium.launch({ headless: true });
const report = { boundary: 'Local production build, synthetic API records, bounded fixture favorite writes. Browser plugin not available; Playwright fallback. No production I/O.', cases: [], errors: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const artworkRatios = [.504, .373, 2.21, .576, .271, .544, .488, .512, 2.153, .487, .804, .427];
const cardSelector = '[aria-label="画作目录"] .gallery-row-item';
const catalogCalls = state => state.calls.filter(call => call.path === '/api/v1/paintings');
const moreCalls = state => catalogCalls(state).filter(call => new URLSearchParams(call.query).get('page') === '1');
const cards = page => page.locator(cardSelector);
const moreButton = page => page.getByRole('button', { name: '加载更多画作', exact: true });

async function waitCards(page, count) {
  await page.waitForFunction(({ selector, count }) => {
    const nodes = [...document.querySelectorAll(selector)];
    return nodes.length === count && nodes.every(node => {
      const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0;
    });
  }, { selector: cardSelector, count }, { timeout: 45000 });
}


async function geometry(page, count, { singleColumn = false, fullyJustified = count >= 3 } = {}) {
  await waitCards(page, count);
  const grid = page.getByRole('region', { name: '画作目录', exact: true });
  const waitKey = `${Date.now()}:${Math.random()}`;
  // ResizeObserver + React may commit several frames after the viewport changes.
  // Wait for the actual row edges, not an arbitrary delay. A permanent layout
  // error still times out and the independent <=1px assertions below remain.
  try {
    await page.waitForFunction(({ count, singleColumn, fullyJustified, waitKey }) => {
      const element = document.querySelector('[aria-label="画作目录"]');
      if (!element || element.getAttribute('aria-busy') === 'true') return false;
      const box = element.getBoundingClientRect(), rows = [...element.querySelectorAll('.gallery-row')];
      if (!box.width || !rows.length) return false;
      const itemCount = rows.reduce((total, row) => total + row.querySelectorAll('.gallery-row-item').length, 0);
      if (itemCount !== count) return false;
      const signature = [innerWidth, box.width, box.height];
      const matches = rows.every(row => {
        const items = [...row.querySelectorAll('.gallery-row-item')];
        if (!items.length || singleColumn && items.length !== 1) return false;
        const rects = items.map(item => item.getBoundingClientRect());
        const left = rects[0].left - box.left, right = box.right - rects.at(-1).right;
        signature.push(...rects.flatMap(rect => [rect.left - box.left, rect.top - box.top, rect.width, rect.height]));
        if (fullyJustified || singleColumn) return Math.abs(left) <= 1 && Math.abs(right) <= 1;
        // A complete search with only one/two works is intentionally centered.
        return left >= -1 && right >= -1 && Math.abs(left - right) <= 1;
      });
      const fingerprint = JSON.stringify(signature);
      const previous = element.__galleryTestGeometry;
      const stableFrames = matches && previous?.key === waitKey && previous.fingerprint === fingerprint ? previous.stableFrames + 1 : matches ? 1 : 0;
      element.__galleryTestGeometry = { key: waitKey, fingerprint, stableFrames };
      return stableFrames >= 2;
    }, { count, singleColumn, fullyJustified, waitKey }, { timeout: 5000, polling: 'raf' });
  } catch (error) {
    const observed = await grid.evaluate(element => {
      const box = element.getBoundingClientRect();
      return { viewport: innerWidth, width: box.width, rows: [...element.querySelectorAll('.gallery-row')].map(row => {
        const first = row.querySelector('.gallery-row-item'), last = row.querySelector('.gallery-row-item:last-child');
        return { left: first?.getBoundingClientRect().left - box.left, right: last?.getBoundingClientRect().right - box.left, count: row.querySelectorAll('.gallery-row-item').length };
      }) };
    });
    throw new Error(`Gallery rows did not settle against the container: ${JSON.stringify(observed)}`, { cause: error });
  } finally {
    await grid.evaluate(element => { delete element.__galleryTestGeometry; });
  }
  const result = await grid.evaluate(element => {
    const gridBox = element.getBoundingClientRect();
    return {
      width: gridBox.width, height: gridBox.height, top: gridBox.top + scrollY,
      rows: [...element.querySelectorAll('.gallery-row')].map(row => {
        const box = row.getBoundingClientRect(), style = getComputedStyle(row);
        return { x: box.left - gridBox.left, y: box.top - gridBox.top, width: box.width, height: box.height, gap: parseFloat(style.columnGap) || 0,
          items: [...row.querySelectorAll('.gallery-row-item')].map(item => {
            const r = item.getBoundingClientRect(), f = item.querySelector('.artwork-preview').getBoundingClientRect();
            const article = item.querySelector('.painting-card').getBoundingClientRect();
            const image = item.querySelector('img');
            return { id: item.dataset.paintingId, title: item.querySelector('h3').textContent, x: r.left - gridBox.left, y: r.top - gridBox.top,
              width: r.width, height: r.height, cardBottom: article.bottom - gridBox.top, imageTop: f.top - gridBox.top, imageBottom: f.bottom - gridBox.top,
              imageHeight: f.height, imageFit: image ? getComputedStyle(image).objectFit : null };
          }) };
      }),
    };
  });
  assert(result.rows.length > 0, 'At least one complete row is rendered');
  const all = result.rows.flatMap(row => row.items);
  assert.equal(all.length, count, 'No omitted or detached cards');
  assert.equal(new Set(all.map(item => item.id)).size, count, 'Unique painting IDs');
  let maxBottomDifference = 0;
  result.rows.forEach((row, index) => {
    assert(row.items.length > 0);
    if (singleColumn) assert.equal(row.items.length, 1, 'Mobile uses one painting per row');
    const bottomDifference = Math.max(...row.items.map(item => item.cardBottom)) - Math.min(...row.items.map(item => item.cardBottom));
    maxBottomDifference = Math.max(maxBottomDifference, bottomDifference);
    assert(bottomDifference <= 1, `Row ${index + 1} card bottoms differ by at most 1px (actual ${bottomDifference})`);
    assert(Math.max(...row.items.map(item => item.imageBottom)) - Math.min(...row.items.map(item => item.imageBottom)) <= 1, 'Image bottoms align within each row');
    if (index) assert(row.y >= result.rows[index - 1].y + result.rows[index - 1].height - 1, 'Rows never overlap');
    row.items.forEach((item, i) => {
      assert(item.width > 0 && item.height > 0);
      assert(item.y + item.height <= result.height + 1, 'Gallery contains every complete card');
      assert(Math.abs(item.y - row.y) <= 1, 'Cards start at the row top');
      if (item.imageFit) assert.equal(item.imageFit, 'contain', 'Base image preserves its proportions inside the crop window');
      if (i) assert(Math.abs(item.x - (row.items[i - 1].x + row.items[i - 1].width + row.gap)) <= 1, 'Uniform horizontal spacing');
    });
    if (fullyJustified || singleColumn) {
      const first = row.items[0], last = row.items.at(-1);
      assert(Math.abs(first.x) <= 1, 'Row starts at the gallery left edge');
      assert(Math.abs(last.x + last.width - result.width) <= 1, `Row ends at the gallery right edge (row ${index}, right ${last.x + last.width}, gallery ${result.width})`);
    }
  });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
  const footer = await page.getByRole('region', { name: '画作加载', exact: true }).boundingBox();
  const gridBox = await grid.boundingBox();
  assert(footer && footer.y >= gridBox.y + gridBox.height - 1, 'Load control clears the finished bottom row');
  assert.equal(await page.getByRole('button', { name: '下一页', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '上一页', exact: true }).count(), 0);
  return { ...result, items: all, maxBottomDifference };
}

function assertStable(before, after) {
  const actual = new Map(after.items.map(item => [item.id, item]));
  for (const previous of before.items) {
    const current = actual.get(previous.id); assert(current);
    for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(current[key] - previous[key]) <= 1, `Already displayed ${previous.title} keeps ${key}`);
  }
}

async function applyKeyword(page, keyword) {
  await page.getByRole('searchbox', { name: '关键词', exact: true }).fill(keyword);
  await page.getByRole('button', { name: '检索画作', exact: true }).click();
}

async function scenario(name, options, run) {
  if (process.env.GALLERY_CASES && !process.env.GALLERY_CASES.split(',').includes(name)) return;
  const record = { name }; report.cases.push(record);
  const context = await browser.newContext({ viewport: { width: options.width || 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const state = { ...newState(), total: 36, missing: false, slow: 0, broken: false, extreme: false, queryDelay: 0, moreDelay: 0, failPageOnce: null, currentDate: '2026-10-30', favorites: new Map(), calls: [], blocked: [], ...options };
  await context.addInitScript(() => localStorage.setItem('artlive.session.token.v1', 'ISOLATED_GALLERY_TEST'));
  if (options.noResizeObserver) await context.addInitScript(() => { window.ResizeObserver = undefined; });
  const page = await context.newPage();
  const errors = [], logs = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) logs.push(message.text()); });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin === web) { await route.continue(); return; }
    if (url.href === 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js') { await route.fulfill({ contentType: 'application/javascript', body: '/* inert isolated shell */' }); return; }
    if (url.origin !== api) { state.blocked.push(request.url()); await route.abort(); return; }
    const headers = { 'access-control-allow-origin': web, 'access-control-allow-methods': 'GET,HEAD,OPTIONS,PUT,DELETE', 'access-control-allow-headers': 'authorization,content-type', 'cache-control': 'no-store' };
    if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    state.calls.push({ method, path: url.pathname, query: url.search });
    const favorite = url.pathname.match(/^\/api\/v1\/paintings\/([^/]+)\/favorite$/);
    if (favorite && ['PUT', 'DELETE'].includes(method)) {
      state.favorites.set(favorite[1], method === 'PUT'); await route.fulfill({ status: 204, headers }); return;
    }
    assert(['GET', 'HEAD'].includes(method), 'Only bounded synthetic favorite writes are permitted');
    if (url.pathname.startsWith('/api/v1/assets/')) {
      const index = Math.max(0, Number.parseInt(url.pathname.split('/')[4].slice(-12), 10) - 1100), asset = assets[index % assets.length];
      if (index >= 12 && state.appendImageGate) await state.appendImageGate;
      if (state.slow) await sleep(state.slow);
      if (state.broken && index === 0) { await route.fulfill({ status: 404, headers, body: '' }); return; }
      if (state.mixed || state.extreme) {
        const [width, height] = state.extreme && index < 2 ? index === 0 ? [100, 2000] : [3000, 100] : [400, Math.round(400 / artworkRatios[index % artworkRatios.length])];
        await route.fulfill({ status: 200, headers, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#b6a58a"/><path d="M0 0L${width} ${height}M${width} 0L0 ${height}" stroke="#f8f3ec" stroke-width="5"/></svg>` }); return;
      }
      await route.fulfill({ status: 200, headers, contentType: 'image/jpeg', body: asset.body }); return;
    }
    if (url.pathname === '/api/v1/paintings') {
      const requestedPage = Number(url.searchParams.get('page') || 0), keyword = url.searchParams.get('keyword') || '';
      if (state.failPageOnce === requestedPage) {
        state.failPageOnce = null;
        await route.fulfill({ status: 503, headers, contentType: 'application/json', body: JSON.stringify({ message: '隔离：追加暂时失败' }) }); return;
      }
      const reset = state.changeDay && requestedPage > 0;
      if (reset) { state.currentDate = '2026-10-31'; state.changeDay = false; }
      const pageNumber = reset ? 0 : requestedPage;
      const total = keyword === '空结果' ? 0 : keyword === '单幅' ? 1 : keyword === '双幅' ? 2 : state.total;
      const count = Math.max(0, Math.min(12, total - pageNumber * 12));
      const newDay = state.currentDate !== '2026-10-30';
      const body = { items: Array.from({ length: count }, (_, i) => {
        let n = pageNumber * 12 + i;
        if (state.duplicates && pageNumber === 1 && i === 0) n = 11;
        const asset = assets[n % assets.length];
        const result = painting(n + 100 + (newDay ? 500 : 0), `${keyword || (newDay ? '新日画作' : '布局预览')} ${n + 1}`);
        result.favorited = state.favorites.get(result.paintingId) || false;
        result.authorName = '展示样本'; result.creationDynastyNormalized = '隔离测试';
        result.category = ['山水', '横幅', '册页', '设色'][n % 4]; result.subject = '本地视觉验证'; result.style = '完整画面';
        if (state.longText && i === 0) { result.title = '很长的画作名称与题跋'.repeat(12); result.subject = '很长的题材描述'.repeat(20); result.authorName = '作者'.repeat(40); }
        result.image.width = state.missing ? null : asset.width; result.image.height = state.missing ? null : asset.height;
        if (state.mixed && !state.missing) { result.image.width = 400; result.image.height = Math.round(400 / artworkRatios[n % artworkRatios.length]); }
        if (state.noImage && i === 1) result.image = null;
        return result;
      }), page: pageNumber, size: 12, totalPages: Math.ceil(total / 12), totalElements: total, first: pageNumber === 0, last: (pageNumber + 1) * 12 >= total, hasNext: (pageNumber + 1) * 12 < total, orderDate: state.currentDate };
      const delay = requestedPage > 0 ? state.moreDelay || state.queryDelay : state.queryDelay;
      if (requestedPage > 0 && state.appendResponseGate) await state.appendResponseGate;
      if (delay) await sleep(delay);
      await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) }); return;
    }
    const result = responseFor(state, method, url, null);
    await route.fulfill({ status: result.status, headers, contentType: result.contentType, body: typeof result.body === 'object' && !Buffer.isBuffer(result.body) ? JSON.stringify(result.body) : result.body });
  });
  const shot = async (suffix, fullPage = true) => page.screenshot({ path: `${output}/${name}-${suffix}.png`, fullPage });
  try {
    await page.goto(`${web}/gallery`, { waitUntil: 'domcontentloaded' });
    assert.equal(new URL(page.url()).pathname, '/gallery'); assert.match(await page.title(), /ArtLIVE/);
    await page.getByRole('heading', { name: '笔墨之间，自有天地' }).waitFor();
    await run({ page, state, shot, context, record });
    assert.equal(await page.locator('nextjs-portal').count(), 0, 'No framework error overlay');
    assert.deepEqual(errors, []); assert.deepEqual(state.blocked, []); assert.deepEqual(state.unknown, []);
    const unexpected = logs.filter(log => !/Failed to load resource.*(?:404|503)/.test(log));
    assert.deepEqual(unexpected, []);
    record.status = 'PASS'; record.console = logs;
  } catch (error) {
    record.status = 'FAIL'; record.error = error.stack; report.errors.push(`${name}: ${error.message}`);
    await shot('failure');
  } finally { await context.close(); }
  console.log(`${name}: ${record.status}`);
}

try {
  await scenario('desktop', {}, async ({ page, state, shot, record }) => {
    const first = await geometry(page, 12);
    record.firstBottomDifference = first.maxBottomDifference;
    const firstCard = cards(page).first();
    await firstCard.getByRole('button', { name: /^收藏/ }).click();
    await firstCard.getByRole('button', { name: /^取消收藏/ }).waitFor();
    await firstCard.getByRole('button', { name: /^取消收藏/ }).click();
    await firstCard.getByRole('button', { name: /^收藏/ }).waitFor();
    await firstCard.locator('button:not([disabled])').waitFor();
    assert.equal(state.calls.filter(call => ['PUT', 'DELETE'].includes(call.method)).length, 2);
    assertStable(first, await geometry(page, 12));
    const links = firstCard.locator('a'); await links.first().focus();
    await page.keyboard.press('Tab'); assert(await links.nth(1).evaluate(element => element === document.activeElement));
    await page.keyboard.press('Tab'); assert(await firstCard.locator('button').evaluate(element => element === document.activeElement));
    await page.keyboard.press('Tab'); assert(await cards(page).nth(1).locator('a').first().evaluate(element => element === document.activeElement));
    await shot('first-batch');
    const dailyCalls = state.calls.filter(call => call.path.endsWith('/paintings/daily')).length;
    state.moreDelay = 300;
    await moreButton(page).evaluate(element => { element.click(); element.click(); });
    const second = await geometry(page, 24); assertStable(first, second);
    assert.equal(moreCalls(state).length, 1, 'Repeated click starts only one append');
    assert(moreCalls(state)[0].query.includes('orderDate=2026-10-30'));
    await moreButton(page).click(); const third = await geometry(page, 36); assertStable(second, third);
    assert.deepEqual(third.items.map(item => item.title), Array.from({ length: 36 }, (_, i) => `布局预览 ${i + 1}`));
    assert.equal(state.calls.filter(call => call.path.endsWith('/paintings/daily')).length, dailyCalls, 'Appending does not refresh daily recommendation');
    assert.equal(await moreButton(page).count(), 0, 'No load button after last batch');
    const footerText = await page.getByRole('region', { name: '画作加载', exact: true }).innerText();
    assert.match(footerText, /36/);
    await page.getByRole('region', { name: '画作加载', exact: true }).scrollIntoViewIfNeeded(); await shot('third-bottom', false);
    record.appended = [12, 24, 36]; record.maxBottomDifference = Math.max(first.maxBottomDifference, second.maxBottomDifference, third.maxBottomDifference);
  });
  for (const variant of [
    { name: 'desktop', width: 1440 },
    { name: 'mobile', width: 390 },
    { name: 'keyboard', width: 1440, keyboard: true },
    { name: 'user-scroll', width: 1440, userScroll: true },
  ]) await scenario(`append-viewport-${variant.name}`, { width: variant.width }, async ({ page, state, shot, record }) => {
    const first = await geometry(page, 12, { singleColumn: variant.width <= 680 });
    const anchorId = first.items.at(-1).id;
    const snapshot = () => page.evaluate(id => {
      const anchor = document.querySelector(`[data-painting-id="${id}"]`);
      return { scrollY, anchorTop: anchor.getBoundingClientRect().top, documentHeight: document.documentElement.scrollHeight };
    }, anchorId);
    const settle = () => page.evaluate(() => new Promise((resolve, reject) => {
      let previous, stable = 0, scheduled;
      const timeout = setTimeout(() => {
        cancelAnimationFrame(scheduled);
        reject(new Error('Viewport failed to settle before measurement'));
      }, 5000);
      const frame = () => {
        const value = `${scrollY}:${document.documentElement.scrollHeight}`;
        stable = value === previous ? stable + 1 : 0; previous = value;
        if (stable >= 3) { clearTimeout(timeout); resolve(); }
        else scheduled = requestAnimationFrame(frame);
      };
      scheduled = requestAnimationFrame(frame);
    }));
    const assertViewport = (before, after, phase) => {
      assert(Math.abs(after.scrollY - before.scrollY) <= 1, `${phase}: append keeps the viewport scrollY (${before.scrollY} -> ${after.scrollY})`);
      assert(Math.abs(after.anchorTop - before.anchorTop) <= 1, `${phase}: the old artwork keeps its viewport offset (${before.anchorTop} -> ${after.anchorTop})`);
    };
    // Keep the footer visible, as in the reported bug. Finish setup scrolling
    // before recording, so Playwright's click cannot mask or cause the jump.
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await settle();
    const button = moreButton(page);
    if (variant.keyboard) { await button.focus(); await settle(); }
    const buttonBox = await button.boundingBox();
    assert(buttonBox.y > 80 && buttonBox.y + buttonBox.height < 1000, 'Load button is already inside the viewport before activation');
    assert(await page.locator('.site-footer').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight + 1), 'Footer is visible before append');
    record.before = await snapshot();
    await shot('before', false);
    let releaseResponse, releaseImages;
    state.appendResponseGate = new Promise(resolve => { releaseResponse = resolve; });
    state.appendImageGate = new Promise(resolve => { releaseImages = resolve; });
    state.missing = true; // Only the new batch now needs natural image sizes.
    try {
      if (variant.keyboard) await page.keyboard.press('Enter'); else await button.click();
      await page.getByRole('button', { name: '正在加载…', exact: true }).waitFor();
      await settle(); record.requesting = await snapshot();
      assertViewport(record.before, record.requesting, 'Request pending');
      releaseResponse();
      await page.locator('.gallery-preparing').waitFor();
      await settle(); record.preparing = await snapshot();
      assert(record.preparing.documentHeight > record.before.documentHeight, 'New preview placeholders really extend the document');
      assertViewport(record.before, record.preparing, 'Image dimensions pending');
      let expected = record.before;
      if (variant.userScroll) {
        await page.mouse.move(100, 450); await page.mouse.wheel(0, -240);
        await page.waitForFunction(y => scrollY < y - 100, expected.scrollY);
        await settle(); expected = record.userPosition = await snapshot();
      }
      releaseImages();
      assertStable(first, await geometry(page, 24, { singleColumn: variant.width <= 680 }));
      await settle(); record.after = await snapshot();
      assertViewport(expected, record.after, variant.userScroll ? 'Keep the user-selected position' : 'Append completed');
      assert.equal(moreCalls(state).length, 1, 'One activation issues one append');
      await shot('after', false);
    } finally { releaseResponse(); releaseImages(); }
  });
  await scenario('responsive', { longText: true }, async ({ page, shot }) => {
    for (const width of [901, 900, 681, 680, 390, 320, 1440]) {
      await page.setViewportSize({ width, height: 844 }); await geometry(page, 12, { singleColumn: width <= 680 });
      if (width === 390) { await cards(page).first().scrollIntoViewIfNeeded(); await shot('mobile', false); }
      await page.getByText('更多筛选', { exact: true }).click(); await page.getByLabel('作者', { exact: true }).click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.getByText('更多筛选', { exact: true }).click();
    }
  });
  await scenario('mobile-browse', { width: 390 }, async ({ page, state, shot }) => {
    await page.setViewportSize({ width: 390, height: 844 }); const first = await geometry(page, 12, { singleColumn: true });
    await moreButton(page).click(); assertStable(first, await geometry(page, 24, { singleColumn: true }));
    await cards(page).first().getByRole('button', { name: /^收藏/ }).click();
    await cards(page).first().getByRole('button', { name: /^取消收藏/ }).waitFor();
    assert.equal(state.calls.filter(call => call.method === 'PUT').length, 1);
    await applyKeyword(page, '移动端山水');
    await page.getByRole('heading', { name: '移动端山水 1', exact: true }).waitFor(); await geometry(page, 12, { singleColumn: true });
    await cards(page).first().scrollIntoViewIfNeeded(); await shot('ready', false);
  });
  await scenario('missing-dimensions', { missing: true, slow: 550, queryDelay: 350 }, async ({ page, shot }) => {
    await page.locator('.loading-section').first().waitFor(); await shot('skeleton');
    const first = await geometry(page, 12);
    for (const card of await cards(page).all()) { await card.scrollIntoViewIfNeeded(); await card.locator('[data-image-state="ready"]').waitFor(); }
    assertStable(first, await geometry(page, 12));
    await moreButton(page).click(); const second = await geometry(page, 24); assertStable(first, second);
    await page.evaluate(() => scrollTo(0, 0)); await shot('resolved');
  });
  await scenario('failed-and-extreme', { missing: true, broken: true, noImage: true }, async ({ page, state, shot }) => {
    await geometry(page, 12);
    for (const card of await cards(page).all()) await card.scrollIntoViewIfNeeded();
    await page.locator('.gallery-painting-card .media-fallback').nth(1).waitFor();
    assert.equal(await page.locator('.gallery-painting-card .media-fallback').count(), 2);
    state.broken = false; state.noImage = false; state.extreme = true; await page.reload();
    const after = await geometry(page, 12);
    assert(after.rows.every(row => row.height < 1400), 'Extreme artwork does not create an unbounded row');
    await cards(page).first().scrollIntoViewIfNeeded(); await cards(page).first().locator('img').waitFor();
    await page.waitForFunction(() => document.querySelector('.gallery-painting-card img')?.naturalHeight === 2000);
    await shot('extreme');
  });
  await scenario('mixed-ratios', { mixed: true }, async ({ page, shot, record }) => {
    const before = await geometry(page, 12);
    assert(new Set(before.items.map(item => Math.round(item.width))).size > 2, 'Painting widths follow different aspect ratios');
    for (let i = 0; i < 2; i++) {
      await page.setViewportSize({ width: 900, height: 1000 });
      if (process.env.GALLERY_GEOMETRY_DEBUG) {
        record.resizeSamples ||= [];
        record.resizeSamples.push(await page.evaluate(async () => {
          const samples = [];
          for (let frame = 0; frame < 12; frame++) {
            const grid = document.querySelector('[aria-label="画作目录"]'), row = grid.querySelector('.gallery-row'), last = row.querySelector('.gallery-row-item:last-child');
            const box = grid.getBoundingClientRect(), item = last.getBoundingClientRect();
            samples.push({ frame, at: performance.now(), viewport: innerWidth, gridWidth: box.width, right: item.right - box.left });
            await new Promise(resolve => requestAnimationFrame(resolve));
          }
          return samples;
        }));
      }
      await geometry(page, 12);
      await page.setViewportSize({ width: 1440, height: 1000 }); assertStable(before, await geometry(page, 12));
    }
    const lastRow = before.rows.at(-1); record.lastRowBottomDifference = Math.max(...lastRow.items.map(item => item.cardBottom)) - Math.min(...lastRow.items.map(item => item.cardBottom));
    await page.getByRole('region', { name: '画作加载', exact: true }).scrollIntoViewIfNeeded(); await shot('bottom', false);
  });
  await scenario('append-retry-and-dedup', { failPageOnce: 1, duplicates: true }, async ({ page, state, shot }) => {
    const before = await geometry(page, 12); await moreButton(page).click();
    await page.getByRole('button', { name: '重试加载', exact: true }).waitFor();
    assertStable(before, await geometry(page, 12)); await shot('retry', false);
    await page.getByRole('button', { name: '重试加载', exact: true }).click(); await geometry(page, 23);
    assert.equal(moreCalls(state).length, 2, 'Retry uses the same page');
    await moreButton(page).click(); await geometry(page, 35);
    assert.equal(catalogCalls(state).filter(call => new URLSearchParams(call.query).get('page') === '2').length, 1);
  });
  await scenario('filter-append-race', { moreDelay: 650 }, async ({ page, state }) => {
    await geometry(page, 12); await moreButton(page).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="画作加载"]')?.textContent.includes('正在加载'));
    await applyKeyword(page, '新查询');
    await page.getByRole('heading', { name: '新查询 1', exact: true }).waitFor();
    await sleep(750); const current = await geometry(page, 12);
    assert(current.items.every(item => item.title.startsWith('新查询 ')), 'Late append cannot enter the new filter');
    assert.equal(await page.getByRole('heading', { name: '布局预览 13', exact: true }).count(), 0);
    assert(catalogCalls(state).some(call => call.query.includes('keyword=') && !call.query.includes('page=1')));
    await page.getByText('更多筛选', { exact: true }).click(); await page.getByLabel('作者', { exact: true }).fill('测试作者');
    await page.locator('select[name="sort"]').selectOption('author');
    await page.getByRole('button', { name: '检索画作', exact: true }).click(); await geometry(page, 12);
    await page.waitForFunction(() => document.querySelector('button[type="submit"][aria-busy="true"]') === null);
    assert(catalogCalls(state).some(call => call.query.includes('sort=author') && call.query.includes('author=')));
    await page.getByRole('button', { name: '清除', exact: true }).click();
    await page.getByRole('heading', { name: '布局预览 1', exact: true }).waitFor(); await geometry(page, 12);
  });
  await scenario('same-query-restart', {}, async ({ page, state, record }) => {
    const firstPageCalls = () => catalogCalls(state).filter(call => Number(new URLSearchParams(call.query).get('page') || 0) === 0).length;
    const submit = page.getByRole('button', { name: '检索画作', exact: true });
    const clear = page.getByRole('button', { name: '清除', exact: true });
    const restart = async control => {
      await control.scrollIntoViewIfNeeded();
      const controlTop = (await control.boundingBox()).y, before = firstPageCalls();
      await control.click();
      await geometry(page, 12);
      assert.equal(firstPageCalls(), before + 1, 'Explicit search/reset requests page zero again');
      assert(Math.abs((await control.boundingBox()).y - controlTop) <= 8, 'Explicit restart stays at the filters instead of restoring an old artwork anchor');
      assert.equal(await page.getByRole('heading', { name: '布局预览 13', exact: true }).count(), 0, 'Previously appended cards are removed');
    };
    const detailAndBack = async () => {
      const target = cards(page).nth(17), id = await target.getAttribute('data-painting-id');
      await target.evaluate(element => scrollTo(0, element.getBoundingClientRect().top + scrollY - 120));
      const offset = (await target.boundingBox()).y, before = catalogCalls(state).length;
      await target.locator('a').first().click(); await page.waitForURL(/\/gallery\/[^/]+$/);
      await page.getByRole('heading', { name: '隔离详情山水', exact: true }).waitFor();
      await page.getByRole('link', { name: '返回画廊', exact: true }).click(); await page.waitForURL(/\/gallery$/);
      await geometry(page, 24);
      await page.waitForFunction(({ id, offset }) => {
        const element = document.querySelector(`[data-painting-id="${id}"]`);
        return element && Math.abs(element.getBoundingClientRect().top - offset) <= 8;
      }, { id, offset }, { timeout: 10000 });
      assert.equal(catalogCalls(state).length, before, 'Ordinary detail return still restores the current batches without refetching');
    };
    await geometry(page, 12);
    // Submit once to use the form's canonical empty-filter representation; the
    // following submissions then repeat exactly the same visible conditions.
    await restart(submit);
    await moreButton(page).click(); await geometry(page, 24);
    await detailAndBack(); // Populate a real old anchor before explicitly restarting.
    await restart(submit);
    await moreButton(page).click(); await geometry(page, 24);
    await restart(clear);
    await moreButton(page).click(); await geometry(page, 24);
    await detailAndBack();
    record.explicitRestarts = 3;
    record.restoredCounts = [24, 24];
  });
  await scenario('daily-reset', {}, async ({ page, state }) => {
    await geometry(page, 12); state.changeDay = true; await moreButton(page).click();
    await page.getByRole('heading', { name: '新日画作 1', exact: true }).waitFor();
    const fresh = await geometry(page, 12);
    assert(fresh.items.every(item => item.title.startsWith('新日画作 ')), 'Midnight reset replaces yesterday instead of appending');
    assert.equal(await page.getByRole('heading', { name: '布局预览 1', exact: true }).count(), 0);
    await moreButton(page).click(); await geometry(page, 24);
    assert(moreCalls(state).some(call => call.query.includes('orderDate=2026-10-31')));
  });
  await scenario('detail-restoration', {}, async ({ page, state, shot }) => {
    await geometry(page, 12); await moreButton(page).click(); await geometry(page, 24);
    const target = cards(page).nth(17), id = await target.getAttribute('data-painting-id');
    await target.evaluate(element => scrollTo(0, element.getBoundingClientRect().top + scrollY - 120));
    const offset = (await target.boundingBox()).y;
    const callsBefore = catalogCalls(state).length;
    await target.locator('a').first().click(); await page.waitForURL(/\/gallery\/[^/]+$/);
    await page.getByRole('heading', { name: '隔离详情山水', exact: true }).waitFor();
    await page.getByRole('link', { name: '返回画廊', exact: true }).click(); await page.waitForURL(/\/gallery$/);
    await geometry(page, 24);
    await page.waitForFunction(({ id, offset }) => {
      const element = document.querySelector(`[data-painting-id="${id}"]`); return element && Math.abs(element.getBoundingClientRect().top - offset) <= 8;
    }, { id, offset }, { timeout: 10000 });
    assert.equal(catalogCalls(state).length, callsBefore, 'Returning restores the loaded feed instead of fetching page zero');
    await shot('restored', false);
    await applyKeyword(page, '保留筛选'); await page.getByRole('heading', { name: '保留筛选 1', exact: true }).waitFor(); await geometry(page, 12);
    await cards(page).first().locator('a').first().click(); await page.waitForURL(/\/gallery\/[^/]+$/);
    await page.getByRole('link', { name: '返回画廊', exact: true }).click(); await page.waitForURL(/\/gallery$/);
    await page.getByRole('heading', { name: '保留筛选 1', exact: true }).waitFor(); await geometry(page, 12);
    assert.equal(await page.getByRole('searchbox', { name: '关键词', exact: true }).inputValue(), '保留筛选');
  });
  for (const tail of [1, 2, 5]) await scenario(`last-batch-${tail}`, { total: 12 + tail, mixed: true }, async ({ page, shot, record }) => {
    const before = await geometry(page, 12); await moreButton(page).click(); const after = await geometry(page, 12 + tail);
    assert.deepEqual(after.items.map(item => item.title), Array.from({ length: 12 + tail }, (_, i) => `布局预览 ${i + 1}`));
    if (tail >= 3) assertStable(before, after);
    else assertStable({ items: before.rows.slice(0, -1).flatMap(row => row.items) }, after);
    assert.equal(await moreButton(page).count(), 0);
    record.maxBottomDifference = after.maxBottomDifference;
    await page.getByRole('region', { name: '画作加载', exact: true }).scrollIntoViewIfNeeded(); await shot('complete', false);
  });
  await scenario('empty-single-and-personal', {}, async ({ page }) => {
    await geometry(page, 12); await applyKeyword(page, '空结果');
    await page.getByRole('heading', { name: '暂未找到匹配的作品' }).waitFor(); assert.equal(await cards(page).count(), 0);
    await applyKeyword(page, '单幅'); await geometry(page, 1, { fullyJustified: false });
    assert.equal(await moreButton(page).count(), 0);
    await applyKeyword(page, '双幅'); await geometry(page, 2, { fullyJustified: false });
    assert.equal(await moreButton(page).count(), 0);
    await page.goto(`${web}/me`); await page.locator('.me-painting-grid article').first().waitFor();
    assert.equal(await page.locator('.gallery-row').count(), 0);
    assert.equal(await page.locator('.me-painting-grid .painting-media').first().evaluate(element => getComputedStyle(element).aspectRatio), '4 / 3');
  });
  await scenario('resize-observer-fallback', { noResizeObserver: true }, async ({ page, record }) => {
    await geometry(page, 12); await page.setViewportSize({ width: 390, height: 844 });
    if (process.env.GALLERY_GEOMETRY_DEBUG) record.resizeSamples = await page.evaluate(async () => {
      const samples = [];
      for (let i = 0; i < 80; i++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        if (i < 8 || i % 10 === 0) {
          const grid = document.querySelector('[aria-label="画作目录"]'), row = grid.querySelector('.gallery-row'), item = row.querySelector('.gallery-row-item');
          samples.push({ frame: i, at: performance.now(), innerWidth, grid: grid.getBoundingClientRect().width, row: row.getBoundingClientRect().width, item: item.getBoundingClientRect().width, style: item.style.width, pageWidth: document.querySelector('.gallery-page').getBoundingClientRect().width, gap: getComputedStyle(row).columnGap });
        }
      }
      return samples;
    });
    await geometry(page, 12, { singleColumn: true });
  });
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
assert.deepEqual(report.errors, []);
