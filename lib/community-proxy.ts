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
