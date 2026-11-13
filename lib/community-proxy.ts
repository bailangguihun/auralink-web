export function communityOrigin(value: string | undefined): string | null {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) || !url.port ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Invalid community origin");
  return url.origin;
}
export function communityPath(parts: string[]): string {
  const id = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
  const valid = parts.length === 1 && ["capabilities", "posts", "uploads", "tags", "cases", "notifications"].includes(parts[0]) ||
    parts.length === 2 && ["posts", "operations", "gallery-references", "media", "tasks", "cases", "comments"].includes(parts[0]) && id(parts[1]) ||
    parts.length === 3 && id(parts[1]) && (
      parts[0] === "posts" && ["comments", "like", "favorite", "growth", "workflow", "tasks", "revisions", "case"].includes(parts[2]) ||
      parts[0] === "comments" && parts[2] === "adopt" || parts[0] === "notifications" && parts[2] === "read" ||
      parts[0] === "media" && parts[2] === "metadata") ||
    parts.length === 5 && parts[0] === "posts" && id(parts[1]) && parts[2] === "revisions" && id(parts[3]) && parts[4] === "review";
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
