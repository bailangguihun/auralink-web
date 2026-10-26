// Real built Next -> proxy -> Node -> PGlite; Core is a contract fixture.
// Browser plugin not available; use the installed Playwright runtime.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const root = process.env.COMMUNITY_SERVICE_ROOT;
const output = process.env.COMMUNITY_BROWSER_OUTPUT;
assert(root && output, 'Set COMMUNITY_SERVICE_ROOT and COMMUNITY_BROWSER_OUTPUT');
const { fixture, paintingId } = await import(pathToFileURL(resolve(root, 'tests/support.mjs')).href);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const web = 'http://127.0.0.1:3177';
await mkdir(output, { recursive: true });
const f = await fixture({ corePort: 3199 });
const report = { boundary: 'Real built Web/proxy/Node/PGlite. Contract-only Core HTTP fixture; no Java/production/provider calls.',
  browserPath: 'Browser plugin not available; Playwright', buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(), cases: [], errors: [] };
let serverLog = '';
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3177'], {
  env: { ...process.env, COMMUNITY_INTERNAL_ORIGIN: f.origin, NEXT_PUBLIC_API_BASE_URL: f.coreUrl }, stdio: ['ignore', 'pipe', 'pipe'],
});
next.stdout.on('data', b => serverLog += b);
next.stderr.on('data', b => serverLog += b);
const delay = ms => new Promise(r => setTimeout(r, ms));
let browser;
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (next.exitCode !== null) throw new Error('Web exited: ' + serverLog);
    try { if ((await fetch(web + '/community')).ok) { ready = true; break; } } catch {}
    await delay(250);
  }
  assert(ready, serverLog);
  let launch = { headless: true };
  if (process.env.COMMUNITY_CHROMIUM_MODULE) {
    const { default: bundled } = await import(process.env.COMMUNITY_CHROMIUM_MODULE);
    launch = { ...launch, executablePath: process.env.COMMUNITY_CHROMIUM_EXECUTABLE || await bundled.executablePath(),
      args: ['--disable-dev-shm-usage', '--no-zygote', '--disable-gpu'] };
  }
  if (process.env.COMMUNITY_FONTCONFIG) launch.env = { ...process.env, FONTCONFIG_FILE: process.env.COMMUNITY_FONTCONFIG };
  for (let i = 0; i < 3; i++) await f.request('/posts', { method: 'POST', payload: {
    requestId: randomUUID(), content: [
      '画里的远山并不浓重，却把目光留在了云气之间。\n你最喜欢这幅画的哪一处留白？',
      '今天试着把目光停在画面边缘。小小的一笔，也能让山水有了呼吸。',
      '一幅画，可以有许多种读法。期待在这里交换不同的观察。',
    ][i], galleryArtworkId: i === 0 ? paintingId : null,
  } });
  async function scenario(name, width, fn) {
    const record = { name, width, writes: [], console: [] }; report.cases.push(record);
    browser = await chromium.launch(launch);
    report.browser = browser.version();
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.addInitScript(origin => { if (location.origin === origin && !localStorage.getItem('artlive.session.token.v1')) localStorage.setItem('artlive.session.token.v1', 'FIXTURE_A'); }, web);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === web || url.origin === f.coreUrl) return route.continue();
      if (url.hostname === 'res.wx.qq.com') return route.fulfill({ contentType: 'application/javascript', body: '/* isolated shell */' });
      return route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => report.errors.push({ name, message: error.message }));
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) record.console.push({ type: message.type(), text: message.text() });
    });
    page.on('request', request => {
      if (request.url().startsWith(web + '/api/community') && ['POST', 'PUT', 'DELETE'].includes(request.method())) {
        record.writes.push({ method: request.method(), path: new URL(request.url()).pathname });
      }
    });
    const shot = suffix => page.screenshot({ path: resolve(output, name + '-' + suffix + '.png'), fullPage: false });
    const overflow = async () => {
      const result = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert(result.scroll <= result.width + 1, JSON.stringify(result));
    };
    try {
      await fn({ page, context, record, shot, overflow });
      assert.equal(report.errors.filter(e => e.name === name).length, 0);
      assert(!await page.locator('nextjs-portal').count(), 'no framework overlay');
      record.status = 'PASS';
    } catch (error) {
      record.status = 'FAIL'; record.error = String(error.stack); await shot('failure').catch(() => {});
    } finally {
      await context.close();
      await browser.close();
      await writeFile(resolve(output, 'RESULT.json'), JSON.stringify(report, null, 2));
    }
  }
  await scenario('desktop-post-comment-recovery', 1440, async ({ page, record, shot, overflow }) => {
    await page.goto(web + '/community');
    await page.getByRole('heading', { name: '画里相逢' }).waitFor();
    await page.getByTestId('community-post').first().waitFor();
    assert((await page.title()).includes('社区')); await overflow(); await shot('feed');
    await page.getByRole('button', { name: '选择画廊国画', exact: true }).click();
    await page.getByRole('button', { name: /山水清音.*隔离测试作者/ }).click();
    await page.getByRole('link', { name: '山水清音', exact: true }).first().waitFor();
    await page.getByLabel('分享你的观画感受').fill('第一轮真实页面交互：山水、留白与远处的回声。');
    await page.getByRole('button', { name: '发布帖子', exact: true }).evaluate(button => { button.click(); button.click(); });
    await page.waitForURL('**/community/posts/*');
    await page.getByText('第一轮真实页面交互：山水、留白与远处的回声。', { exact: true }).waitFor();
    await page.getByLabel('写下评论').fill('清浅的笔墨，也能让人慢下来。');
    await page.getByRole('button', { name: '发表评论', exact: true }).click();
    await page.getByText('清浅的笔墨，也能让人慢下来。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '赞 · 0', exact: true }).click();
    await page.getByRole('button', { name: '已赞 · 1', exact: true }).waitFor();
    await page.getByRole('button', { name: '收藏帖子', exact: true }).click();
    await page.getByRole('button', { name: '已收藏', exact: true }).waitFor();
    const writes = record.writes.length;
    await page.reload();
    await page.getByText('清浅的笔墨，也能让人慢下来。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '已赞 · 1', exact: true }).waitFor();
    assert.equal(record.writes.length, writes); await overflow(); await shot('detail');
    const postId = new URL(page.url()).pathname.split('/').pop();
    assert.equal((await f.request('/posts/' + postId)).data.commentCount, 1);
    assert.equal((await f.request('/posts/' + postId)).data.likeCount, 1);
    assert.equal(record.writes.length, 4, 'double click did not produce an extra POST');
  });
  await scenario('mobile-favorites-account-isolation', 390, async ({ page, record, shot, overflow }) => {
    await page.goto(web + '/community');
    await page.getByTestId('community-post').first().waitFor();
    await page.getByRole('button', { name: '我的收藏', exact: true }).click();
    await page.getByTestId('community-post').first().waitFor();
    await page.getByRole('button', { name: '已赞 · 1', exact: true }).click();
    await page.getByRole('button', { name: '赞 · 0', exact: true }).click();
    await page.getByRole('button', { name: '已赞 · 1', exact: true }).waitFor();
    assert(await page.getByRole('button', { name: '已收藏', exact: true }).isVisible());
    assert(await page.getByRole('link', { name: '评论 · 1', exact: true }).isVisible());
    await page.evaluate(() => scrollTo(0, 0));
    await overflow(); await shot('favorites');
    await page.getByRole('button', { name: '写一条分享', exact: true }).click();
    await page.getByLabel('分享你的观画感受').fill('账号 A 的私有草稿');
    await page.evaluate(() => {
      localStorage.setItem('artlive.session.token.v1', 'FIXTURE_B');
      dispatchEvent(new StorageEvent('storage', { key: 'artlive.session.token.v1' }));
    });
    await page.waitForFunction(() => document.querySelector('#community-draft')?.value === '');
    assert.equal(await page.getByLabel('分享你的观画感受').inputValue(), '');
    await page.getByRole('button', { name: '我的收藏', exact: true }).click();
    await page.getByRole('heading', { name: '还没有收藏的帖子' }).waitFor();
    assert.equal(await page.getByTestId('community-post').count(), 0);
    assert.equal(record.writes.length, 2); await overflow(); await shot('account-b');
  });
  await scenario('partial-failure-preserves-draft', 1440, async ({ page, record, shot }) => {
    await page.goto(web + '/community'); await page.getByTestId('community-post').first().waitFor();
    await page.getByLabel('分享你的观画感受').fill('列表失败时仍保留的草稿');
    await page.route('**/api/community/posts?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '隔离列表故障' }) }));
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await page.getByRole('heading', { name: '帖子读取失败' }).waitFor();
    assert.equal(await page.getByLabel('分享你的观画感受').inputValue(), '列表失败时仍保留的草稿');
    await shot('error');
    await page.unroute('**/api/community/posts?*');
    await page.getByRole('button', { name: '重新读取帖子', exact: true }).click();
    await page.getByTestId('community-post').first().waitFor();
    assert.equal(record.writes.length, 0);
  });
  await scenario('slow-list-independent-composer', 390, async ({ page, record, shot, overflow }) => {
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    await page.route('**/api/community/posts?*', async route => { await barrier; return route.continue(); });
    await page.goto(web + '/community');
    await page.getByRole('button', { name: '写一条分享', exact: true }).click();
    await page.getByLabel('分享你的观画感受').fill('读取列表时也能编辑');
    await page.getByRole('region', { name: '正在读取社区', exact: true }).waitFor();
    await overflow(); await shot('loading');
    release();
    await page.getByTestId('community-post').first().waitFor();
    assert.equal(await page.getByLabel('分享你的观画感受').inputValue(), '读取列表时也能编辑');
    assert.equal(record.writes.length, 0);
  });
  await scenario('lost-ack-reload-reads-journal', 1440, async ({ page, record, shot }) => {
    await page.goto(web + '/community'); await page.getByTestId('community-post').first().waitFor();
    await page.route('**/api/community/operations/*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"暂不可核对"}' }));
    await page.route('**/api/community/posts', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort('failed');
    });
    await page.getByLabel('分享你的观画感受').fill('回包丢失也只能创建一次');
    await page.getByRole('button', { name: '发布帖子', exact: true }).click();
    await page.getByRole('button', { name: '核对操作结果', exact: true }).waitFor();
    assert(await page.getByRole('button', { name: '发布帖子', exact: true }).isDisabled());
    await page.reload();
    await page.getByRole('button', { name: '核对操作结果', exact: true }).waitFor();
    await shot('unknown');
    await page.unroute('**/api/community/operations/*');
    await page.getByRole('button', { name: '核对操作结果', exact: true }).click();
    await page.waitForURL('**/community/posts/*');
    await page.getByText('回包丢失也只能创建一次', { exact: true }).waitFor();
    assert.equal(record.writes.filter(r => r.method === 'POST').length, 1);
    assert.equal((await f.database.query("SELECT count(*)::int AS count FROM community.posts WHERE content='回包丢失也只能创建一次'")).rows[0].count, 1);
  });
  await scenario('revoked-source-and-long-content', 390, async ({ page, shot, overflow }) => {
    const made = await f.request('/posts', { method: 'POST', payload: { requestId: randomUUID(), content: 'A'.repeat(600), galleryArtworkId: paintingId } });
    f.state.available = false;
    await page.goto(web + '/community/posts/' + made.data.result.postId);
    await page.getByText('原作已不可查看，引用关系保留。', { exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: '山水清音', exact: true }).count(), 0);
    await overflow(); await shot('revoked');
    f.state.available = true;
  });
  assert.equal(f.state.writes, 0);
  assert(report.cases.every(c => c.status === 'PASS'), 'See RESULT.json for failed scenarios');
} finally {
  if (browser) await browser.close();
  next.kill('SIGTERM');
  await f.close();
  await writeFile(resolve(output, 'web.log'), serverLog);
  await writeFile(resolve(output, 'RESULT.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ result: 'PASS', scenarios: report.cases.length, output }));
