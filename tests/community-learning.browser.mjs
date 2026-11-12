// Real production Next -> BFF -> Community -> PGlite. Core identity/catalog are
// contract fixtures. No provider, production account or real artwork is written.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { newState as assistantState, responseFor as assistantResponse, id as assistantId } from './fixtures/assistant-ui-runtime.mjs';

const root = process.env.COMMUNITY_SERVICE_ROOT, output = process.env.COMMUNITY_BROWSER_OUTPUT;
assert(root && output, 'Set COMMUNITY_SERVICE_ROOT and COMMUNITY_BROWSER_OUTPUT');
const { fixture } = await import(pathToFileURL(resolve(root, 'tests/support.mjs')).href);
const { default: sharp } = await import(pathToFileURL(resolve(root, 'node_modules/sharp/lib/index.js')).href);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const f = await fixture({ corePort: 3199, learning: true });
const web = 'http://127.0.0.1:3177';
await mkdir(output, { recursive: true });
const report = { boundary: 'Production Next/BFF/Node/PGlite; contract-only Core identities/catalog. No models or production writes.',
  buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(), checks: [], errors: [], expectedFaults: [], writes: [] };
let log = '', browser;
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3177'], {
  env: { ...process.env, COMMUNITY_INTERNAL_ORIGIN: f.origin, NEXT_PUBLIC_API_BASE_URL: f.coreUrl }, stdio: ['ignore', 'pipe', 'pipe'],
});
next.stdout.on('data', value => log += value); next.stderr.on('data', value => log += value);
const checked = name => { report.checks.push(name); console.log('PASS ' + name); };
const write = (path, method, payload = {}, token = 'FIXTURE_A') => f.request(path, { method, payload: { requestId: randomUUID(), ...payload }, token });
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (next.exitCode !== null) throw new Error(log);
    try { if ((await fetch(web + '/community')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(ready, log);
  browser = await chromium.launch({ headless: true, executablePath: process.env.COMMUNITY_CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--no-proxy-server'] });
  report.browser = browser.version();
  async function account(token) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.addInitScript(({ origin, token }) => {
      if (location.origin === origin && !localStorage.getItem('artlive.session.token.v1')) localStorage.setItem('artlive.session.token.v1', token);
    }, { origin: web, token });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === web || url.origin === f.coreUrl) return route.continue();
      if (url.hostname === 'res.wx.qq.com') return route.fulfill({ contentType: 'application/javascript', body: '/* isolated shell */' });
      return route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('request', request => {
      if (request.url().startsWith(web + '/api/community') && ['POST','PUT','DELETE'].includes(request.method())) report.writes.push({ method: request.method(), path: new URL(request.url()).pathname });
    });
    return page;
  }
  const owner = await account('FIXTURE_A'), peer = await account('FIXTURE_B');
  const image = await sharp({ create: { width: 100, height: 160, channels: 3, background: '#b4b8a1' } }).png().toBuffer();
  const upload = page => page.getByLabel('添加作品图片', { exact: true }).setInputFiles({ name: '隔离测试作品.png', mimeType: 'image/png', buffer: image });
  const waitText = (page, text) => page.getByText(text, { exact: true }).first().waitFor();
  const overflow = async page => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow');
  const title = '浏览器验收 · 留白';
  await owner.goto(web + '/community');
  await owner.getByRole('button', { name: '作品求助', exact: true }).click();
  await owner.getByLabel('作品名称', { exact: true }).fill(title);
  await owner.getByLabel('作品背景与想请教的问题', { exact: true }).fill('隔离测试图片，验证作品成长的完整交互。');
  await owner.getByLabel('这次想改善什么？', { exact: true }).fill('改善留白与墨色关系');
  await owner.getByLabel('话题标签', { exact: true }).fill('山水，学习');
  let uploads = 0;
  await owner.route('**/api/community/uploads', async route => {
    uploads++; const response = await route.fetch(); assert.equal(response.status(), 200);
    report.expectedFaults.push('upload committed, response lost'); await route.abort('failed');
  });
  await upload(owner);
  await owner.locator('.community-upload-thumbs > div').waitFor();
  assert.equal(uploads, 1);
  await owner.unroute('**/api/community/uploads');
  await owner.getByRole('button', { name: '发布作品求助' }).click();
  await owner.waitForURL('**/community/posts/*');
  const postPath = new URL(owner.url()).pathname, postId = postPath.split('/').pop();
  await owner.getByRole('button', { name: `查看${title}第 1 张原图`, exact: true }).click();
  await owner.getByRole('dialog').locator('img').evaluate(img => img.decode());
  await owner.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  checked('artwork/image publication, original preview and one-POST upload reconciliation');
  await peer.goto(web + postPath);
  await peer.getByLabel('点评维度', { exact: true }).selectOption('构图');
  await peer.getByLabel('你的观察', { exact: true }).fill('近景偏重。');
  await peer.getByLabel('修改建议', { exact: true }).fill('减弱近景墨色，打开水面。');
  await peer.getByRole('button', { name: '发表作品点评', exact: true }).click();
  await waitText(peer, '近景偏重。');
  await owner.reload();
  await owner.getByRole('button', { name: '采纳这条点评', exact: true }).click();
  await owner.locator('.community-adopted').waitFor();
  await owner.getByRole('button', { name: '整理已采纳建议' }).click();
  await owner.locator('.community-task input').check();
  await owner.waitForFunction(() => document.querySelector('.community-task.is-done input')?.checked === true);
  await owner.getByRole('button', { name: '上传修改版本' }).click();
  await upload(owner); await owner.locator('.community-upload-thumbs > div').waitFor();
  await owner.getByLabel('这一版改了什么？', { exact: true }).fill('打开水面，保留连续留白。');
  await owner.getByRole('button', { name: '保存第 2 版', exact: true }).click();
  await owner.getByRole('heading', { name: '第 2 版', exact: true }).waitFor();
  await owner.getByRole('button', { name: '邀请原点评者复评', exact: true }).click();
  await waitText(owner, '已邀请原点评者复评');
  await peer.reload();
  const revision = (await f.request(`/posts/${postId}/growth`)).data.revisions[0];
  await peer.getByLabel('对应版本', { exact: true }).selectOption(revision.id);
  await peer.getByLabel('你的观察', { exact: true }).fill('第二版留白更连贯。');
  await peer.getByLabel('修改建议', { exact: true }).fill('保持墨色节奏。');
  await peer.getByRole('button', { name: '发表作品点评', exact: true }).click();
  await waitText(peer, '第二版留白更连贯。');
  await owner.reload(); await waitText(owner, '已收到复评');
  await owner.getByRole('button', { name: '对照前后版本', exact: true }).click();
  await owner.locator('.community-version-comparison img').first().evaluate(img => img.decode());
  await owner.getByLabel('当前成长状态', { exact: true }).selectOption('completed');
  await owner.getByRole('button', { name: '整理成长案例草稿' }).click();
  await waitText(owner, '仅作者可见的草稿');
  assert.equal((await f.request(`/posts/${postId}/growth`, { token: 'FIXTURE_B' })).data.caseCard, null);
  await owner.getByRole('button', { name: '确认发布到成长案例', exact: true }).click();
  await waitText(owner, '已发布案例');
  assert.equal((await f.request('/cases?dimension=构图')).data.items.length, 1);
  checked('two-identity critique, adoption, tasks, V2 review, comparison and explicit case publication');

  // A citation remains readable even when its comment is outside the first page.
  for (let i = 0; i < 12; i++) assert.equal((await write(`/posts/${postId}/comments`, 'POST', { content: '分页交流 ' + i }, 'FIXTURE_B')).status, 200);
  const last = await write(`/posts/${postId}/comments`, 'POST', { content: '最后一页的具体观察', dimension: '笔墨', suggestion: '把引用保留到原点评。' }, 'FIXTURE_B');
  await write(`/comments/${last.data.result.commentId}/adopt`, 'PUT', { enabled: true });
  await write(`/posts/${postId}/tasks`, 'POST');
  await owner.reload();
  assert.equal(await owner.getByText('最后一页的具体观察', { exact: true }).count(), 0);
  await owner.locator('.community-task').filter({ hasText: '把引用保留到原点评。' }).getByRole('link', { name: '原点评' }).click();
  await waitText(owner.getByRole('dialog'), '最后一页的具体观察');
  await owner.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  checked('source-comment dialog resolves citations beyond current comment pagination');
  for (const page of [owner, peer]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await overflow(page);
  }
  await owner.screenshot({ path: resolve(output, 'growth-mobile.png'), fullPage: true });
  await owner.goto(web + '/community?kind=artwork&tag=学习');
  await owner.getByTestId('community-post').waitFor(); await overflow(owner);
  await owner.screenshot({ path: resolve(output, 'feed-mobile.png'), fullPage: false });
  await owner.getByRole('button', { name: '写一条分享', exact: true }).click();
  await owner.getByLabel('分享你的观画感受', { exact: true }).fill('账号 A 的私有草稿');
  await owner.waitForFunction(() => sessionStorage.getItem('artlive.community.draft.v2:101')?.includes('账号 A 的私有草稿'));
  await owner.reload();
  assert.equal(await owner.getByLabel('分享你的观画感受', { exact: true }).inputValue(), '账号 A 的私有草稿');
  await owner.evaluate(() => { localStorage.setItem('artlive.session.token.v1', 'FIXTURE_B'); dispatchEvent(new StorageEvent('storage', { key: 'artlive.session.token.v1' })); });
  await owner.waitForFunction(() => document.querySelector('#community-draft')?.value === '');
  await owner.evaluate(() => { localStorage.setItem('artlive.session.token.v1', 'FIXTURE_A'); dispatchEvent(new StorageEvent('storage', { key: 'artlive.session.token.v1' })); });
  await owner.waitForFunction(() => document.querySelector('#community-draft')?.value === '账号 A 的私有草稿');
  checked('390px layout, reload draft recovery and account isolation');

  let releaseMetadata;
  const metadataBarrier = new Promise(resolve => { releaseMetadata = resolve; });
  let metadataStarted;
  const metadataSeen = new Promise(resolve => { metadataStarted = resolve; });
  let queuePosts = 0;
  const observeQueue = request => { if (request.url() === web + '/api/community/uploads' && request.method() === 'POST') queuePosts++; };
  owner.on('request', observeQueue);
  await owner.route('**/api/community/media/*/metadata', async route => { metadataStarted(); await metadataBarrier; await route.continue().catch(() => {}); });
  await owner.getByLabel('添加作品图片', { exact: true }).setInputFiles([
    { name: '队列一.png', mimeType: 'image/png', buffer: image },
    { name: '队列二.png', mimeType: 'image/png', buffer: image },
  ]);
  await metadataSeen;
  await owner.evaluate(() => { localStorage.setItem('artlive.session.token.v1', 'FIXTURE_B'); dispatchEvent(new StorageEvent('storage', { key: 'artlive.session.token.v1' })); });
  await owner.waitForFunction(() => document.querySelector('#community-draft')?.value === '');
  const lateMetadata = owner.waitForResponse(response => /\/api\/community\/media\/[^/]+\/metadata$/.test(response.url())).catch(() => null);
  releaseMetadata(); await lateMetadata;
  await owner.waitForLoadState('networkidle');
  assert.equal(queuePosts, 1, 'old multi-file queue stops after account switch');
  await owner.unroute('**/api/community/media/*/metadata'); owner.off('request', observeQueue);
  await owner.evaluate(() => { localStorage.setItem('artlive.session.token.v1', 'FIXTURE_A'); dispatchEvent(new StorageEvent('storage', { key: 'artlive.session.token.v1' })); });
  await owner.waitForFunction(() => document.querySelector('#community-draft')?.value === '账号 A 的私有草稿');
  checked('account switch stops old multi-image queue before another POST');

  // Commit succeeds upstream, but the browser loses both ACK and first lookup.
  let postWrites = 0;
  await owner.route('**/api/community/operations/*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"暂不可核对"}' }));
  await owner.route('**/api/community/posts', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    postWrites++; assert.equal((await route.fetch()).status(), 200); await route.abort('failed');
  });
  await owner.getByRole('button', { name: '发布帖子', exact: false }).click();
  await owner.getByRole('button', { name: '核对操作结果', exact: true }).waitFor();
  await owner.reload(); await owner.getByRole('button', { name: '核对操作结果', exact: true }).waitFor();
  await owner.unroute('**/api/community/operations/*');
  await owner.getByRole('button', { name: '核对操作结果', exact: true }).click();
  await owner.waitForURL('**/community/posts/*'); assert.equal(postWrites, 1);
  report.expectedFaults.push('post committed, ACK and first operation reads lost; reload only GET');
  await owner.unroute('**/api/community/posts');
  const discussionPath = new URL(owner.url()).pathname;
  await owner.getByRole('button', { name: '编辑帖子', exact: true }).click();
  await owner.getByRole('dialog').getByLabel('正文', { exact: true }).fill('编辑后仍保存原帖身份');
  await owner.getByRole('button', { name: '保存修改', exact: true }).click();
  await waitText(owner, '编辑后仍保存原帖身份');
  await peer.goto(web + discussionPath); await peer.getByLabel('写下评论', { exact: true }).fill('同伴的回复入口');
  await peer.getByRole('button', { name: '发表评论', exact: true }).click(); await waitText(peer, '同伴的回复入口');
  await owner.reload(); await owner.getByRole('button', { name: '回复', exact: true }).click();
  await owner.getByLabel('写下评论', { exact: true }).fill('感谢同伴');
  await owner.getByRole('button', { name: '发表评论', exact: true }).click(); await waitText(owner, '感谢同伴');
  await owner.getByRole('button', { name: '编辑帖子', exact: true }).click();
  await owner.getByRole('button', { name: '删除帖子', exact: true }).click();
  await owner.getByRole('button', { name: '确认删除帖子', exact: true }).click();
  await owner.waitForURL(/\/community(?:\?|$)/);
  assert.equal((await f.request('/posts/' + discussionPath.split('/').pop())).status, 404);
  checked('one-POST lost acknowledgement/reload recovery; owner edit/delete and same-post replies');

  // The assistant is an intercepted contract fixture. Imported files and their
  // hashes are real; no run or model endpoint is allowed to execute.
  const transferImages = [];
  for (let i = 0; i < 4; i++) {
    const buffer = await sharp({ create: { width: 30, height: 40, channels: 3, background: ['#a6b0a1','#9a8e79','#c0b8a3','#747f71'][i] } }).png().toBuffer();
    const response = await fetch(f.origin + '/api/v1/community/uploads', { method: 'POST', headers: { authorization: 'Bearer FIXTURE_A', 'content-type': 'image/png', 'x-request-id': randomUUID(), 'x-file-name': `transfer-${i}.png` }, body: buffer });
    assert.equal(response.status, 200); transferImages.push((await response.json()).result.assetId);
  }
  const made = await write('/posts', 'POST', { content: '用于助手导入恢复的隔离作品', title: '四张图片的交接', kind: 'artwork', imageIds: transferImages });
  const transferPath = '/community/posts/' + made.data.result.postId;
  const assistant = assistantState(), attachmentBytes = new Map();
  let uploadAttempts = 0, refuseNextSecond = true;
  await owner.route(f.coreUrl + '/api/v1/assistant/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': web, 'cache-control':'no-store' }, body: JSON.stringify(body) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': web, 'access-control-allow-methods':'GET,POST,DELETE,OPTIONS', 'access-control-allow-headers':'authorization,content-type' } });
    if (path.endsWith('/attachments') && method === 'POST') {
      uploadAttempts++;
      if (uploadAttempts === 2 && refuseNextSecond) { refuseNextSecond = false; return json({ code:'ASSISTANT_QUOTA_EXCEEDED', message:'隔离注入：第二张上传被拒绝' }, 413); }
      const form = await new Request(request.url(), { method, headers: request.headers(), body: request.postDataBuffer() }).formData();
      const file = form.get('file'), buffer = Buffer.from(await file.arrayBuffer()), attachmentId = randomUUID();
      const attachment = { ...assistant.attachment, id: attachmentId, filename: file.name, byteSize: buffer.length,
        sha256: createHash('sha256').update(buffer).digest('hex'), width:30,height:40,contentUrl:`/api/v1/assistant/attachments/${attachmentId}/content` };
      assistant.attachments.push(attachment); attachmentBytes.set(attachmentId, buffer); return json(attachment);
    }
    if (/\/attachments\/[^/]+$/.test(path) && method === 'DELETE') {
      assistant.attachments = assistant.attachments.filter(item => item.id !== path.split('/').pop());
      return route.fulfill({ status:204, headers:{'access-control-allow-origin':web}, body:'' });
    }
    const attachment = assistant.attachments.find(item => path.includes('/attachments/' + item.id));
    if (attachment && method === 'GET') {
      if (path.endsWith('/content')) return route.fulfill({ status:200, contentType:'image/png', headers:{'access-control-allow-origin':web}, body:attachmentBytes.get(attachment.id) });
      return json(attachment);
    }
    assert(!(method === 'POST' && path.endsWith('/runs')), 'import never invokes a model');
    const response = assistantResponse(assistant, method, url, request.postData()?.startsWith('{') ? request.postDataJSON() : null);
    return route.fulfill({ status:response.status, contentType:response.contentType, headers:{'access-control-allow-origin':web,'cache-control':'no-store'}, body:typeof response.body === 'string' ? response.body : JSON.stringify(response.body) });
  });
  await owner.goto(web + transferPath);
  await owner.getByRole('button', { name:'带到国画助手分析' }).click();
  await owner.goto(web + '/assistant?session=' + assistantId(1));
  await owner.getByRole('button', { name:'导入作品与问题', exact:true }).click();
  await owner.getByText(/图片配额不足，服务器未接受这次新增上传/).first().waitFor();
  assert.equal(assistant.attachments.length, 1);
  assert.equal(await owner.getByRole('region', { name:'社区作品导入' }).getByRole('checkbox', { checked:true }).count(), 4);
  await owner.getByRole('button', { name:'导入作品与问题', exact:true }).click();
  await owner.getByRole('button', { name:'导入作品与问题', exact:true }).waitFor({ state:'detached' });
  assert.equal(assistant.attachments.length,4); assert.equal(uploadAttempts,5,'confirmed first image is not uploaded twice');
  assert((await owner.getByRole('textbox', { name:'消息',exact:true }).inputValue()).includes('用于助手导入恢复的隔离作品'));
  assert.equal(assistant.unknown.length,0);
  checked('four-image assistant import resumes after partial refusal without repeating the confirmed upload');
  // Explicitly remove an imported file; a fresh import checks the actual draft.
  await owner.getByRole('button', { name:'移除待发送图片',exact:true }).first().click();
  await owner.waitForFunction(() => document.querySelectorAll('[data-testid^="attachment-"]').length === 3);
  await owner.goto(web + transferPath);
  await owner.getByRole('button', { name:'带到国画助手分析' }).click();
  await owner.goto(web + '/assistant?session=' + assistantId(1));
  await owner.getByRole('button', { name:'导入作品与问题',exact:true }).click();
  await owner.getByRole('button', { name:'导入作品与问题',exact:true }).waitFor({ state:'detached' });
  assert.equal(assistant.attachments.length,4); assert.equal(uploadAttempts,6);
  assert.equal(assistant.writes.filter(item => item.path.endsWith('/runs')).length,0);
  await owner.screenshot({ path:resolve(output,'assistant-import.png'),fullPage:false });
  checked('four-image assistant import resumes after partial failure and rechecks explicitly removed attachments; zero model calls');
  assert.equal(f.state.writes, 0, 'No Core writes or model calls'); assert.deepEqual(report.errors, []);
  report.pass = true;
} catch (error) {
  report.pass = false; report.failure = String(error.stack); throw error;
} finally {
  if (browser) {
    if (!report.pass) for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
      await page.screenshot({ path: resolve(output, `failure-${index}.png`), fullPage: true }).catch(() => {});
      await writeFile(resolve(output, `failure-${index}.aria.txt`), await page.locator('body').ariaSnapshot()).catch(() => {});
      await writeFile(resolve(output, `failure-${index}.html`), await page.content()).catch(() => {});
    }
    await browser.close();
  }
  next.kill('SIGTERM'); await f.close();
  await writeFile(resolve(output, 'LEARNING_RESULT.json'), JSON.stringify(report, null, 2));
  await writeFile(resolve(output, 'learning-web.log'), log);
}
