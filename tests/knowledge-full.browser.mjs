/**
 * Rendered knowledge regression using a local real-data backend and a dedicated
 * private test account. There are no mocked API responses. The only allowed POST
 * is login; no production origins, registrations or business writes are allowed.
 *
 * Required: KNOWLEDGE_WEB_URL, KNOWLEDGE_API_URL, KNOWLEDGE_TEST_ACCOUNT_FILE,
 * KNOWLEDGE_BROWSER_OUTPUT. PLAYWRIGHT_MODULE may use an existing installation.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const loopback = key => {
  const value = new URL(process.env[key]);
  assert.equal(value.protocol, "http:");
  assert(["localhost", "127.0.0.1"].includes(value.hostname), `${key} must be local`);
  assert(!value.username && !value.password && !value.search && !value.hash);
  return value.origin;
};
const web = loopback("KNOWLEDGE_WEB_URL");
const api = loopback("KNOWLEDGE_API_URL");
// The existing global shell loads this SDK. Keep third-party network disabled
// and classify only its exact intentional block, never other console failures.
const existingWechatSdk = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
const output = process.env.KNOWLEDGE_BROWSER_OUTPUT;
assert(output, "A Git-external evidence directory is required");
const accountFile = process.env.KNOWLEDGE_TEST_ACCOUNT_FILE;
assert.equal((await stat(accountFile)).mode & 0o077, 0, "Test credentials must be private");
const account = JSON.parse(await readFile(accountFile, "utf8"));
assert.equal(typeof account.username, "string");
assert.equal(typeof account.password, "string");
await mkdir(output, { recursive: true });

const titles = {
  geography: "作者地域分布", dynasty: "朝代分布", category: "作品分类",
  style: "绘画风格", imagery: "画中意象", sentiment: "配乐情感",
  sentimentByDynasty: "朝代情感", relations: "关系标签",
};
const expectedCounts = JSON.parse(process.env.KNOWLEDGE_EXPECTED_COUNTS ||
  '{"geography":25,"dynasty":178,"category":3,"style":6762,"imagery":11819,"sentiment":7,"sentimentByDynasty":149}');
const report = {
  boundary: "Local production frontend and real local API/data; dedicated test account; login only; no mocked responses or production traffic. Browser-sized viewports are not physical iPad coverage.",
  browserAvailability: "Browser plugin not available; existing Playwright is used without installing dependencies.",
  web, api, startedAt: new Date().toISOString(), checks: [], screenshots: [], requests: [],
  console: [], pageErrors: [], requestFailures: [], forbidden: [], expectedExternalBlocked: [], counts: {},
};
const browser = await chromium.launch({ headless: true });
report.browser = { engine: "Chromium", version: browser.version() };
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", serviceWorkers: "block" });
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on("pageerror", error => report.pageErrors.push(error.message));
page.on("console", message => {
  if (["error", "warning"].includes(message.type())) report.console.push({ type: message.type(), text: message.text(), url: message.location().url });
});
page.on("requestfailed", request => report.requestFailures.push({ url: request.url(), path: new URL(request.url()).pathname, failure: request.failure()?.errorText }));
await context.route("**/*", async route => {
  const request = route.request(), url = new URL(request.url());
  const entry = { origin: url.origin, path: url.pathname, method: request.method() };
  if (request.url() === existingWechatSdk && request.method() === "GET") {
    report.expectedExternalBlocked.push({ ...entry, reason: "Existing global WeChat SDK is outside the local-only test boundary" });
    await route.abort("blockedbyclient"); return;
  }
  const allowed = [web, api].includes(url.origin) &&
    (["GET", "HEAD", "OPTIONS"].includes(request.method()) ||
      (url.origin === api && url.pathname === "/api/auth/login" && request.method() === "POST"));
  if (!allowed) { report.forbidden.push(entry); await route.abort("blockedbyclient"); return; }
  report.requests.push(entry);
  await route.continue();
});

const step = async (name, run) => {
  await run(); report.checks.push({ name, status: "PASS" }); console.log(`PASS ${name}`);
};
const stable = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const metric = key => page.locator(`[data-knowledge-metric="${key}"]`);
const rows = key => metric(key).locator("[data-knowledge-item]");
const exactName = (key, name) => metric(key).locator(".knowledge-item-name").filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
const noOverflow = async () => {
  const size = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
  assert(size.documentWidth <= size.width + 1, `Horizontal page overflow: ${JSON.stringify(size)}`);
};
const shot = async (name, target) => {
  if (target) await target.scrollIntoViewIfNeeded();
  await stable();
  const path = `${output}/${name}.png`;
  await page.screenshot({ path, mask: [page.locator(".session-actions")], maskColor: "#efe7db" });
  report.screenshots.push({ name, path, sha256: createHash("sha256").update(await readFile(path)).digest("hex") });
};
const textAbsent = async () => {
  const visible = await page.locator("main").innerText();
  for (const phrase of ["统计说明", "图谱来源与使用边界", "循着一条关系，读懂一重诗意", "搜索实体", "重置筛选", "数据表", "图中前", "查看数值", "图例列出前", "其余关系标签", "以下概览不随搜索筛选变化", "点击图中实体或下方实体卡"]) {
    assert(!visible.includes(phrase), `Removed auxiliary copy is present: ${phrase}`);
  }
  assert.equal(await page.locator(".knowledge-rules, .knowledge-metric-controls, .knowledge-limit-note, .knowledge-snapshot, .knowledge-search").count(), 0);
  assert.equal(await page.locator("main small").count(), 0, "Knowledge view adds no small-print elements");
};

// The test account's token stays in the browser evaluation and is never returned,
// serialized, logged or stored in the evidence report.
const readApi = path => page.evaluate(async ({ api, path }) => {
  const token = localStorage.getItem("artlive.session.token.v1");
  if (!token) throw new Error("Dedicated local account has no session");
  const response = await fetch(`${api}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Read-only API ${path.split("?")[0]} returned ${response.status}`);
  return response.json();
}, { api, path });

async function searchMetric(key, query) {
  const panel = metric(key), title = titles[key];
  const field = panel.getByRole("searchbox", { name: `搜索${title}`, exact: true });
  await field.fill(query);
  await panel.getByRole("button", { name: "搜索", exact: true }).click();
  await page.waitForFunction(({ key, query }) => {
    const root = document.querySelector(`[data-knowledge-metric="${key}"]`);
    const names = [...root.querySelectorAll(".knowledge-item-name")].map(node => node.textContent);
    return names.length && names.every(name => name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  }, { key, query });
  await stable();
}

async function waitRows(key, minimum = 1) {
  await page.waitForFunction(({ key, minimum }) => document.querySelectorAll(`[data-knowledge-metric="${key}"] [data-knowledge-item]`).length >= minimum, { key, minimum });
  await stable();
}

let graph;
try {
  await step("Real account login opens the correct knowledge page", async () => {
    await page.goto(`${web}/knowledge`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("用户名", { exact: true }).fill(account.username);
    await page.getByLabel("密码", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.locator("#knowledge-paintings .knowledge-count strong").first().waitFor();
    assert.equal(new URL(page.url()).pathname, "/knowledge");
    assert.match(await page.title(), /知识库/);
    report.pageIdentity = { url: page.url(), title: await page.title() };
    report.population = await page.locator("#knowledge-paintings .knowledge-count strong").allInnerTexts();
    assert(report.population[0].replaceAll(",", "") === "9067");
    await textAbsent(); await noOverflow();
    assert.equal(await page.locator("nextjs-portal, #webpack-dev-server-client-overlay").count(), 0);
  });

  await step("All seven metric endpoints report complete item totals", async () => {
    for (const [key, expected] of Object.entries(expectedCounts)) {
      const data = await readApi(`/api/v1/knowledge/painting-statistics/${key}?page=0&size=200&sort=value`);
      assert.equal(data.schemaVersion, 1); assert.equal(data.metric, key);
      assert.equal(data.totalItems, expected, `${key} complete total`);
      assert.equal(data.page, 0); assert.equal(data.size, 200);
      assert.equal(data.totalPages, Math.ceil(expected / 200));
      assert.equal(data.items.length, Math.min(expected, 200));
      assert.equal(data.hasMore, data.totalPages > 1);
      report.counts[key] = { totalItems: data.totalItems, totalPages: data.totalPages, revision: data.revision };
      await metric(key).waitFor();
    }
    for (const key of ["geography", "dynasty", "style", "imagery", "sentimentByDynasty"]) await waitRows(key);
    await shot("paintings-desktop", page.locator("#knowledge-paintings .knowledge-counts"));
  });

  await step("Full style and imagery pagination has no lost or duplicated items", async () => {
    for (const key of ["style", "imagery"]) {
      const result = await page.evaluate(async ({ api, key }) => {
        const token = localStorage.getItem("artlive.session.token.v1");
        const headers = { Authorization: `Bearer ${token}` };
        const firstResponse = await fetch(`${api}/api/v1/knowledge/painting-statistics/${key}?page=0&size=200&sort=value`, { headers });
        if (!firstResponse.ok) throw new Error(`First ${key} page failed ${firstResponse.status}`);
        const first = await firstResponse.json();
        const pages = [first];
        for (let start = 1; start < first.totalPages; start += 4) {
          const batch = await Promise.all(Array.from({ length: Math.min(4, first.totalPages - start) }, async (_, offset) => {
            const response = await fetch(`${api}/api/v1/knowledge/painting-statistics/${key}?page=${start + offset}&size=200&sort=value&revision=${encodeURIComponent(first.revision)}`, { headers });
            if (!response.ok) throw new Error(`Traversed ${key} page failed ${response.status}`);
            return response.json();
          }));
          pages.push(...batch);
        }
        const items = pages.flatMap(data => data.items);
        return { totalItems: first.totalItems, pages: pages.length, received: items.length,
          unique: new Set(items.map(item => item.name)).size,
          sameRevision: pages.every(data => data.revision === first.revision),
          lastPage: pages.at(-1).page, lastHasMore: pages.at(-1).hasMore,
          lastItem: items.at(-1), maxValue: items[0].value,
          descending: items.every((item, index) => index === 0 || items[index - 1].value >= item.value) };
      }, { api, key });
      assert.equal(result.received, expectedCounts[key]); assert.equal(result.unique, result.received);
      assert(result.sameRevision); assert.equal(result.lastHasMore, false); assert(result.descending);
      report.counts[key].traversal = result;
    }
  });

  await step("Style last-page navigation and whole-dataset low-frequency search work", async () => {
    const panel = metric("style"), title = titles.style;
    const select = panel.getByLabel(`${title}页码`, { exact: true });
    const options = await select.locator("option").evaluateAll(nodes => nodes.map(node => ({ value: node.value, text: node.textContent })));
    assert(options.length > 1);
    const lastItem = report.counts.style.traversal.lastItem;
    await select.selectOption(options.at(-1).value);
    await exactName("style", lastItem.name).waitFor();
    await waitRows("style");
    assert.equal(await panel.getByRole("button", { name: "下一页", exact: true }).isDisabled(), true);
    await searchMetric("style", lastItem.name);
    await exactName("style", lastItem.name).waitFor();
    assert((await panel.innerText()).includes(String(lastItem.value)));
    report.styleSearch = { name: lastItem.name, value: lastItem.value };
    await shot("style-low-frequency", panel);
    await searchMetric("imagery", report.counts.imagery.traversal.lastItem.name);
    await exactName("imagery", report.counts.imagery.traversal.lastItem.name).waitFor();
  });

  await step("Graph and relationship summary contain the complete real snapshot", async () => {
    await page.getByRole("tab", { name: "诗词图谱", exact: true }).click();
    graph = await readApi("/api/v1/knowledge/poetry-graph");
    assert.equal(graph.nodes.length, 711); assert.equal(graph.links.length, 609);
    assert.equal(graph.entityTypes.length, 10); assert.equal(graph.relationTypes.length, 406);
    await page.waitForFunction(() => {
      const node = document.querySelector(".knowledge-graph");
      return node?.getAttribute("aria-label")?.includes("711 个实体、609 条关系") && node.querySelector("canvas");
    });
    await textAbsent();
    const poetryCards = page.locator("#knowledge-poetry .knowledge-count");
    assert.equal(await poetryCards.count(), 2);
    assert.deepEqual(await poetryCards.locator("span").allInnerTexts(), ["诗词作品数", "作者名称数"]);
    const expectedPoems = graph.nodes.filter(node => node.category.includes("诗词")).length;
    const expectedAuthors = new Set(graph.nodes.filter(node => node.category.includes("诗人"))
      .map(node => node.name.trim()).filter(Boolean)).size;
    const actualCounts = (await poetryCards.locator("strong").allInnerTexts()).map(value => Number(value.replaceAll(",", "")));
    assert.deepEqual(actualCounts, [expectedPoems, expectedAuthors]);
    report.poetryCounts = { poems: actualCounts[0], authorNames: actualCounts[1] };
    assert.equal(await page.locator(".knowledge-inspector").count(), 0);
    await metric("entityTypes").waitFor();
    await waitRows("relations");
    const relationTotal = await metric("relations").getByLabel("关系标签项目数量", { exact: true }).innerText();
    assert(relationTotal.includes("406"));
    assert(!(await metric("relations").innerText()).includes("其余"));
    report.snapshot = { nodes: graph.nodes.length, links: graph.links.length, entityTypes: graph.entityTypes.length, relationTypes: graph.relationTypes.length, graphSha256: graph.graphSha256, statsSha256: graph.statsSha256 };
    await page.getByRole("button", { name: "适应全图", exact: true }).click();
    await page.locator('.knowledge-graph[data-graph-fitted="true"]').waitFor();
    await page.getByRole("button", { name: "放大图谱", exact: true }).click();
    await page.getByRole("button", { name: "缩小图谱", exact: true }).click();
    const oldHeight = await page.locator(".knowledge-graph").evaluate(node => node.getBoundingClientRect().height);
    await page.getByRole("button", { name: "展开视图", exact: true }).click();
    await page.waitForFunction(height => document.querySelector(".knowledge-graph").getBoundingClientRect().height > height, oldHeight);
    assert.equal(await page.locator(".knowledge-graph-view.is-expanded").count(), 1);
    await page.getByRole("button", { name: "收起视图", exact: true }).click();
    await page.getByRole("button", { name: "适应全图", exact: true }).click();
    await page.locator('.knowledge-graph[data-graph-fitted="true"]').waitFor();
    await shot("poetry-desktop", page.locator(".knowledge-graph-panel"));
  });

  await step("Every relationship label remains searchable; entity selection shows details on demand", async () => {
    const single = graph.relationTypes.find(item => item.value === 1);
    assert(single);
    await searchMetric("relations", single.name);
    await exactName("relations", single.name).waitFor();
    const entity = page.locator(".knowledge-entity").first();
    await entity.focus(); await page.keyboard.press("Enter");
    await page.locator(".knowledge-inspector h3").waitFor();
    assert((await page.locator(".knowledge-inspector").innerText()).trim().length > 0);
    await page.getByRole("button", { name: "清除选择", exact: true }).click();
    assert.equal(await page.locator(".knowledge-inspector").count(), 0);
    const pagination = page.getByRole("navigation", { name: "实体分页", exact: true });
    const firstName = await page.locator(".knowledge-entity h3").first().innerText();
    await pagination.getByRole("button", { name: "下一页", exact: true }).click();
    assert.notEqual(await page.locator(".knowledge-entity h3").first().innerText(), firstName);
    assert((await pagination.innerText()).includes("2"));
  });

  for (const [name, viewport] of [["tablet", { width: 1180, height: 820 }], ["mobile", { width: 390, height: 844 }]]) {
    await step(`${name} layout preserves real controls, readable labels and graph`, async () => {
      await page.setViewportSize(viewport);
      const clear = page.getByRole("button", { name: "清除选择", exact: true });
      if (await clear.isEnabled()) await clear.click();
      await page.getByRole("button", { name: "适应全图", exact: true }).click();
      await stable(); await noOverflow(); await textAbsent();
      await shot(`poetry-${name}`, page.locator(".knowledge-graph-panel"));
      await page.getByRole("tab", { name: "国画统计", exact: true }).click();
      await metric("style").waitFor(); await noOverflow(); await textAbsent();
      const controlSizes = await metric("style").locator("input,select,button").evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
      assert(controlSizes.every(size => size >= 14), "New controls must not become small print");
      await shot(`paintings-${name}`, page.locator("#knowledge-paintings .knowledge-counts"));
      await shot(`style-${name}`, metric("style"));
      await page.getByRole("tab", { name: "诗词图谱", exact: true }).click();
    });
  }

  await step("No unexpected runtime errors, foreign traffic or business writes", async () => {
    assert.deepEqual(report.pageErrors, []);
    report.expectedConsole = report.console.filter(item => item.url === existingWechatSdk &&
      /^Failed to load resource: net::ERR_BLOCKED_BY_CLIENT(?:\.Inspector)?$/.test(item.text));
    report.unexpectedConsole = report.console.filter(item => !report.expectedConsole.includes(item));
    assert.deepEqual(report.unexpectedConsole, []);
    assert.deepEqual(report.forbidden, []);
    const failures = report.requestFailures.filter(item => item.failure !== "net::ERR_ABORTED" &&
      !(item.url === existingWechatSdk && /^net::ERR_BLOCKED_BY_CLIENT(?:\.Inspector)?$/.test(item.failure)));
    assert.deepEqual(failures, []);
    assert(report.requests.every(request => ["GET", "HEAD", "OPTIONS"].includes(request.method) || request.path === "/api/auth/login"));
  });
  report.outcome = "PASS";
} catch (error) {
  report.outcome = "FAIL";
  report.failure = String(error?.stack || error);
  await page.screenshot({ path: `${output}/failure.png`, mask: [page.locator(".session-actions")] }).catch(() => {});
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${output}/RESULT.json`, `${JSON.stringify(report, null, 2)}\n`);
  await context.close(); await browser.close();
}
