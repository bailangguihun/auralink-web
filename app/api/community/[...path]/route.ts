import { communityOrigin, communityPath } from "@/lib/community-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" };
function failure(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ code, message }), { status, headers });
}
async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  let destination: string;
  try {
    const origin = communityOrigin(process.env.COMMUNITY_INTERNAL_ORIGIN);
    if (!origin) return failure(503, "COMMUNITY_NOT_CONFIGURED", "社区暂未开放，请稍后再来。");
    destination = origin + communityPath((await context.params).path) + new URL(request.url).search;
  } catch { return failure(404, "NOT_FOUND", "接口不存在。"); }
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer [^\s,]{1,8192}$/.test(authorization)) return failure(401, "UNAUTHORIZED", "请先登录。");
  const forwarded: Record<string, string> = { authorization, accept: "application/json" };
  const origin = request.headers.get("origin");
  if (origin) forwarded.origin = origin;
  let payload: Uint8Array | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return failure(415, "JSON_REQUIRED", "请提交 JSON。");
    forwarded["content-type"] = "application/json";
    const reader = request.body?.getReader(), chunks: Uint8Array[] = [];
    let length = 0;
    if (!reader) return failure(400, "INVALID_BODY", "请求内容为空。");
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.length;
        if (length > 32768) { await reader.cancel(); return failure(413, "REQUEST_TOO_LARGE", "请求内容过大。"); }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    payload = Buffer.concat(chunks);
  }
  try {
    const upstream = await fetch(destination, {
      method: request.method, headers: forwarded, body: payload,
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000),
    });
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return failure(503, "COMMUNITY_RESULT_UNCERTAIN", "请求结果尚未确认，请读取操作记录，不要重复提交。");
  }
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
