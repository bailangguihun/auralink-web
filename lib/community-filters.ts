import type { CommunityFilters } from "./community.ts";
export function communityFilters(search: string): CommunityFilters {
  const params = new URLSearchParams(search);
  const select = (key: string, allowed: string[], fallback = "") => allowed.includes(params.get(key) || "") ? params.get(key) || "" : fallback;
  const rawPage = params.get("page") || "0", page = /^\d{1,5}$/.test(rawPage) ? Math.min(Number(rawPage), 10000) : 0;
  return { view: select("view", ["all", "mine", "favorites"], "all"), kind: select("kind", ["", "discussion", "artwork"]),
    workflow: select("workflow", ["", "seeking_feedback", "revising", "completed"]), q: (params.get("q") || "").slice(0, 100),
    tag: (params.get("tag") || "").slice(0, 20), sort: select("sort", ["latest", "popular"], "latest"), page,
    tab: select("tab", ["feed", "notifications", "cases"], "feed") };
}
export function communityHref(filters: CommunityFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== "" && value !== 0 && !(key === "view" && value === "all") && !(key === "sort" && value === "latest") && !(key === "tab" && value === "feed")) params.set(key, String(value));
  return "/community" + (params.size ? "?" + params.toString() : "");
}
export const communityReturnKey = (actorId: string) => "artlive.community.return.v1:" + actorId;
export function readCommunityReturn(value: string | null): { href: string; scrollY: number } | null {
  try {
    const row = JSON.parse(value || "null");
    if (!row || typeof row.href !== "string" || !/^\/community(?:\?|$)/.test(row.href) || !Number.isFinite(row.scrollY)) return null;
    return { href: communityHref(communityFilters(row.href.split("?")[1] || "")), scrollY: Math.min(Math.max(row.scrollY, 0), 100000) };
  } catch { return null; }
}
