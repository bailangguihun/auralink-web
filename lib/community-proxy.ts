export function communityOrigin(value: string | undefined): string | null {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) || !url.port ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Invalid community origin");
  return url.origin;
}
export function communityPath(parts: string[]): string {
  const valid = parts.length === 1 && ["capabilities", "posts"].includes(parts[0]) ||
    parts.length === 2 && ["posts", "operations", "gallery-references"].includes(parts[0]) && /^[0-9a-f-]{36}$/.test(parts[1]) ||
    parts.length === 3 && parts[0] === "posts" && /^[0-9a-f-]{36}$/.test(parts[1]) && ["comments", "like", "favorite"].includes(parts[2]);
  if (!valid) throw new Error("Unknown community endpoint");
  return "/api/v1/community/" + parts.join("/");
}
/** Read failures can be retried; a failed write may already have committed. */
export function communityUpstreamFailure(method: string) {
  if (method === "GET" || method === "HEAD") {
    return { code: "COMMUNITY_UNAVAILABLE", message: "暂时无法连接社区，请稍后重试。" };
  }
  return { code: "COMMUNITY_RESULT_UNCERTAIN", message: "请求结果尚未确认，请读取操作记录，不要重复提交。" };
}
