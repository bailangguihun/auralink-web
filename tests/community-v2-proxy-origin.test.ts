import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import ts from "typescript";

type Handler = (request: Request, context: { params: Promise<{ path: string[] }> }) => Promise<Response>;

test("v2 proxy preserves the public Origin for upstream validation behind an internal Next URL", async () => {
  const publicOrigin = "https://artlive.example";
  const received: { origin: string | undefined; body: string; path: string | undefined }[] = [];
  const upstream = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    received.push({ origin: request.headers.origin, body: Buffer.concat(chunks).toString(), path: request.url });
    // The Community gateway owns the configured public-origin allowlist.
    const status = request.headers.origin === publicOrigin ? 200 : 403;
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify({ code: status, data: status === 200 ? { ticket: "local-fixture-ticket" } : null }));
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const previous = process.env.COMMUNITY_INTERNAL_ORIGIN;
  process.env.COMMUNITY_INTERNAL_ORIGIN = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  try {
    const source = await readFile(new URL("../app/api/community/v2/[...path]/route.ts", import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    // Resolve Next's alias to the real configuration module; no fetch/handler mocks.
    const alias = /from ["']@\/lib\/community-host-origin["']/g;
    assert.equal([...compiled.matchAll(alias)].length, 1);
    const executable = compiled.replace(alias, "from " + JSON.stringify(new URL("../lib/community-host-origin.ts", import.meta.url).href));
    const { POST } = await import("data:text/javascript;base64," + Buffer.from(executable).toString("base64")) as { POST: Handler };
    const context = () => ({ params: Promise.resolve({ path: ["api", "ws-ticket"] }) });
    const request = (origin: string, authorized = true) => new Request("http://127.0.0.1:19083/api/community/v2/api/ws-ticket", {
      method: "POST", body: "{}",
      headers: {
        "content-type": "application/json", origin,
        "x-forwarded-host": "untrusted.invalid", "x-forwarded-proto": "http",
        ...(authorized ? { authorization: "Bearer local-fixture" } : {}),
      },
    });

    const accepted = await POST(request(publicOrigin), context());
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).data.ticket, "local-fixture-ticket");
    assert.deepEqual(received[0], { origin: publicOrigin, body: "{}", path: "/api/v2/community/api/ws-ticket" });

    const rejected = await POST(request("https://foreign.invalid"), context());
    assert.equal(rejected.status, 403);
    assert.equal((await rejected.json()).code, 403);
    assert.equal(received[1].origin, "https://foreign.invalid");

    const anonymous = await POST(request(publicOrigin, false), context());
    assert.equal(anonymous.status, 401);
    assert.equal(received.length, 2);
  } finally {
    if (previous === undefined) delete process.env.COMMUNITY_INTERNAL_ORIGIN;
    else process.env.COMMUNITY_INTERNAL_ORIGIN = previous;
    upstream.closeAllConnections();
    await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve()));
  }
});
