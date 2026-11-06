/**
 * Real ECharts/React DOM regression against an already-running isolated preview.
 * Uses an existing private test account; never run against production.
 * Supply KNOWLEDGE_WEB_URL, KNOWLEDGE_API_URL, KNOWLEDGE_TEST_ACCOUNT_FILE and
 * KNOWLEDGE_BROWSER_OUTPUT. PLAYWRIGHT_MODULE may point to an existing installation.
 * No production snapshots, credentials, traces or browser storage are written.
 */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
function loopback(name) {
  const url = new URL(process.env[name]);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1");
  assert(!url.username && !url.password && !url.search && !url.hash);
  return url.origin;
}
const web = loopback("KNOWLEDGE_WEB_URL"), api = loopback("KNOWLEDGE_API_URL");
const accountFile = process.env.KNOWLEDGE_TEST_ACCOUNT_FILE;
assert.equal((await stat(accountFile)).mode & 0o077, 0, "Private test account must not be group/world readable");
const account = JSON.parse(await readFile(accountFile, "utf8"));
const out = process.env.KNOWLEDGE_BROWSER_OUTPUT;
assert(out, "Set a Git-external evidence directory");
await mkdir(out, { recursive: true });
const report = { web, api, browser: "real Chromium with bundled ECharts", checks: [], descriptions: [], screenshots: [], requests: [], errors: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on("pageerror", error => report.errors.push(error.message));
await context.route("**/*", async route => {
  const req = route.request(), url = new URL(req.url());
  assert([web, api].includes(url.origin), "Test must stay on its two explicit loopback origins");
  assert(["GET", "HEAD", "OPTIONS"].includes(req.method()) || (req.method() === "POST" && url.origin === api && url.pathname === "/api/auth/login"));
  report.requests.push({ method: req.method(), origin: url.origin, path: url.pathname });
  await route.continue();
});
const step = async (name, fn) => { await fn(); report.checks.push(name); console.log(`OK ${name}`); };
const description = (nodes, links) => `诗词力导向图，${nodes} 个实体、${links} 条关系；可通过下方实体卡和关系列表进行键盘操作`;
const graphCounts = async (name, nodes, links) => {
  const expected = description(nodes, links);
  await page.waitForFunction(label => {
    const el = document.querySelector(".knowledge-graph");
    return el?.getAttribute("aria-label") === label && el.hasAttribute("_echarts_instance_") && el.querySelector("canvas");
  }, expected);
  // setOption has run on a real ECharts instance; verify after the rendering frame too.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const actual = await page.locator(".knowledge-graph").getAttribute("aria-label");
  assert.equal(actual, expected);
  assert(!/NaN|undefined/.test(actual));
  assert((await page.locator(".knowledge-graph-toolbar").innerText()).includes(`${nodes} 个实体 · ${links} 条关系`));
  report.descriptions.push({ name, nodes, links, actual });
};
const shot = async name => {
  await page.locator(".knowledge-graph-panel").scrollIntoViewIfNeeded();
  const path = `${out}/${name}.png`;
  await page.screenshot({ path, mask: [page.locator(".session-actions")], maskColor: "#efe7db" });
  report.screenshots.push({ name, sha256: createHash("sha256").update(await readFile(path)).digest("hex") });
};
let graph;
const entityPage = async target => {
  const navigation = page.getByRole("navigation", { name: "实体分页", exact: true });
  const current = async () => {
    const match = (await navigation.innerText()).match(/第\s*(\d+)\s*\//);
    assert(match, "Entity pagination exposes its current page");
    return Number(match[1]) - 1;
  };
  let index = await current();
  while (index !== target) {
    const next = index + (target > index ? 1 : -1);
    await navigation.getByRole("button", { name: target > index ? "下一页" : "上一页", exact: true }).click();
    await page.waitForFunction(expected => {
      const text = document.querySelector('[aria-label="实体分页"]')?.textContent || "";
      return Number(text.match(/第\s*(\d+)\s*\//)?.[1]) === expected;
    }, next + 1);
    index = await current();
  }
};
const entityCard = async node => {
  const index = graph.nodes.findIndex(item => item.id === node.id);
  assert(index >= 0);
  await entityPage(Math.floor(index / 20));
  const card = page.locator(".knowledge-entity").nth(index % 20);
  assert.equal(await card.locator("h3").innerText(), node.name);
  return card;
};
try {
  await step("Existing isolated account login; unchanged six-painting statistics", async () => {
    await page.goto(`${web}/knowledge`);
    await page.getByLabel("用户名", { exact: true }).fill(account.username);
    await page.getByLabel("密码", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.locator(".knowledge-count strong").first().waitFor();
    assert.equal(await page.locator(".knowledge-count strong").first().innerText(), "6");
    assert.equal(await page.locator(".knowledge-count strong").nth(1).innerText(), "2");
  });
  await step("Full real snapshot: 711 nodes / 609 links; keyboard tab selection", async () => {
    const response = page.waitForResponse(r => r.url() === `${api}/api/v1/knowledge/poetry-graph` && r.status() === 200);
    await page.getByRole("tab", { name: "国画统计", exact: true }).focus();
    await page.keyboard.press("End");
    graph = await (await response).json();
    assert.equal(graph.nodes.length, 711); assert.equal(graph.links.length, 609);
    assert.equal(new Set(graph.nodes.map(n => n.id)).size, 711);
    assert(graph.links.every(l => graph.nodes.some(n => n.id === l.source) && graph.nodes.some(n => n.id === l.target)));
    report.snapshot = { graphSha256: graph.graphSha256, statsSha256: graph.statsSha256, nodes: 711, links: 609 };
    await graphCounts("full", 711, 609); await shot("poetry-aria-desktop");
  });
  await step("Poetry tab opens directly on the full graph without removed introduction or filters", async () => {
    assert.equal(await page.locator(".knowledge-snapshot, .knowledge-search").count(), 0);
    assert.equal(await page.getByLabel("搜索实体", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "重置筛选", exact: true }).count(), 0);
    assert.equal(await page.locator(".knowledge-inspector").count(), 0);
    await entityPage(1);
    await graphCounts("entity-page-full", 711, 609);
    assert.equal(await page.locator(".knowledge-entity h3").first().innerText(), graph.nodes[20].name);
    await entityPage(0);
  });
  await step("Keyboard entity focus, relation detail and clear retain truthful counts", async () => {
    const node = graph.nodes.find(item => graph.links.some(link => link.source === item.id || link.target === item.id));
    assert(node, "The real snapshot provides an entity with a relationship");
    const ids = new Set([node.id]);
    for (const link of graph.links) { if (link.source === node.id) ids.add(link.target); if (link.target === node.id) ids.add(link.source); }
    const card = await entityCard(node);
    await card.focus(); await page.keyboard.press("Enter");
    await graphCounts("one-hop", ids.size, graph.links.filter(link => ids.has(link.source) && ids.has(link.target)).length);
    const summary = page.locator(".knowledge-inspector summary");
    await summary.focus(); await page.keyboard.press("Enter");
    const relation = page.locator(".knowledge-relations button").first();
    await relation.focus(); await page.keyboard.press("Space");
    assert.match(await page.locator(".knowledge-inspector").innerText(), /关系详情/);
    await page.getByRole("button", { name: "清除选择", exact: true }).focus(); await page.keyboard.press("Space");
    await graphCounts("keyboard-reset", 711, 609);
    assert.equal(await page.locator(".knowledge-inspector").count(), 0);
  });
  await step("Existing isolated node remains reachable through entity pages; narrow layout", async () => {
    const connected = new Set(graph.links.flatMap(link => [link.source, link.target]));
    const node = graph.nodes.find(item => !connected.has(item.id));
    assert(node, "The real snapshot must provide an isolated node");
    const card = await entityCard(node);
    await graphCounts("isolated-card-full", 711, 609);
    await card.focus(); await page.keyboard.press("Enter");
    await graphCounts("isolated-focus", 1, 0);
    assert.match(await page.locator(".knowledge-inspector").innerText(), /此实体没有相邻关系/);
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await shot("poetry-aria-isolated-narrow");
  });
  await step("Clear selection restores the full graph; entity pagination stays keyboard accessible", async () => {
    await page.getByRole("button", { name: "清除选择", exact: true }).focus(); await page.keyboard.press("Enter");
    await graphCounts("selection-reset", 711, 609);
    assert.equal(await page.locator(".knowledge-inspector").count(), 0);
    assert.equal(await page.locator(".knowledge-snapshot, .knowledge-search").count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await shot("poetry-aria-full-narrow");
    await entityPage(0);
    const pagination = page.getByRole("navigation", { name: "实体分页", exact: true });
    await pagination.getByRole("button", { name: "下一页", exact: true }).focus(); await page.keyboard.press("Enter");
    assert.match(await pagination.innerText(), /第 2 \/ 36 页/);
    assert.equal(report.requests.filter(request => /china-map|china\.json/.test(request.path)).length, 0);
    assert.deepEqual(report.errors, []);
  });
  report.result = "passed";
} catch (error) {
  report.result = "failed"; report.failure = error.message;
  report.failureGraphDescription = await page.locator(".knowledge-graph").first().getAttribute("aria-label").catch(() => null);
  throw error;
} finally {
  await writeFile(`${out}/RESULT.json`, `${JSON.stringify(report, null, 2)}\n`);
  await context.close(); await browser.close();
}
