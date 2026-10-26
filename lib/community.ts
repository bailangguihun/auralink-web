import { ApiError, toApiError } from "./api.ts";

export type GalleryReference = { state: "AVAILABLE" | "UNAVAILABLE" | "UNVERIFIED"; paintingId: string; title?: string; authorName?: string; period?: string };
export type CommunityPost = {
  id: string; content: string; author: { id: string; displayName: string }; createdAt: string;
  commentCount: number; likeCount: number; liked: boolean; favorited: boolean; galleryReference: GalleryReference | null;
};
export type CommunityComment = Pick<CommunityPost, "id" | "content" | "author" | "createdAt">;
export type CommunityPage<T> = { items: T[]; page: number; hasNext: boolean };
export type OperationResult = { kind: string; postId: string; commentId?: string; enabled?: boolean };
export type OperationOutcome = { state: "COMMITTED" | "NOT_OBSERVED"; result: OperationResult | null };
export type OperationHandle = { requestId: string; actorId: string; kind: string };
export type CommunityCapabilities = { contractVersion: number; actor: { id: string; displayName: string }; posts: boolean; galleryReferences: boolean };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("社区返回格式不完整，请重新读取。");
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("社区返回格式不完整，请重新读取。");
  return value;
}
function id(value: unknown): string {
  const parsed = string(value);
  if (!uuidPattern.test(parsed)) throw new Error("社区记录标识无效。");
  return parsed;
}
export function parseOutcome(value: unknown): OperationOutcome {
  const row = object(value);
  if (row.state === "NOT_OBSERVED" && row.result === null) return { state: "NOT_OBSERVED", result: null };
  if (row.state !== "COMMITTED") throw new Error("操作结果尚未确认。");
  const result = object(row.result);
  const parsed: OperationResult = { kind: string(result.kind), postId: id(result.postId) };
  if (!["post", "comment", "like", "favorite", "delete"].includes(parsed.kind)) throw new Error("操作结果尚未确认。");
  if (result.commentId !== undefined) parsed.commentId = id(result.commentId);
  if (result.enabled !== undefined) {
    if (typeof result.enabled !== "boolean") throw new Error("操作结果尚未确认。");
    parsed.enabled = result.enabled;
  }
  if (parsed.kind === "comment" && !parsed.commentId || ["like", "favorite"].includes(parsed.kind) && typeof parsed.enabled !== "boolean") {
    throw new Error("操作结果尚未确认。");
  }
  return { state: "COMMITTED", result: parsed };
}
export function parseReference(value: unknown): GalleryReference {
  const row = object(value), paintingId = id(row.paintingId);
  if (row.state === "UNAVAILABLE" || row.state === "UNVERIFIED") return { state: row.state, paintingId };
  if (row.state !== "AVAILABLE") throw new Error("作品来源尚未确认。");
  return { state: "AVAILABLE", paintingId, title: string(row.title), authorName: string(row.authorName), period: string(row.period) };
}
export function parsePost(value: unknown): CommunityPost {
  const row = object(value), author = object(row.author);
  for (const key of ["likeCount", "commentCount"]) {
    if (!Number.isSafeInteger(row[key]) || (row[key] as number) < 0) throw new Error("社区计数返回格式不完整。");
  }
  if (typeof row.liked !== "boolean" || typeof row.favorited !== "boolean") throw new Error("社区互动状态返回格式不完整。");
  return {
    id: id(row.id), content: string(row.content), createdAt: string(row.createdAt),
    author: { id: string(author.id), displayName: string(author.displayName) },
    likeCount: row.likeCount as number, commentCount: row.commentCount as number, liked: row.liked, favorited: row.favorited,
    galleryReference: row.galleryReference === null ? null : parseReference(row.galleryReference),
  };
}
function parsePage<T>(value: unknown, item: (value: unknown) => T): CommunityPage<T> {
  const row = object(value);
  if (!Array.isArray(row.items) || !Number.isSafeInteger(row.page) || (row.page as number) < 0 || typeof row.hasNext !== "boolean") throw new Error("社区列表返回格式不完整。");
  return { items: row.items.map(item), page: row.page as number, hasNext: row.hasNext };
}
export async function communityRequest(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch("/api/community" + path, { ...options, cache: "no-store", redirect: "error",
    headers: { authorization: "Bearer " + token, ...(options.body ? { "content-type": "application/json" } : {}) } });
  let value: unknown;
  try { value = await response.json(); } catch { throw new Error("社区响应尚未确认，请读取操作结果。"); }
  if (!response.ok) throw toApiError(response.status, value);
  return value;
}
export const communityApi = {
  async capabilities(token: string, signal?: AbortSignal): Promise<CommunityCapabilities> {
    const row = object(await communityRequest("/capabilities", token, { signal })), actor = object(row.actor);
    if (row.contractVersion !== 1 || typeof row.posts !== "boolean" || typeof row.galleryReferences !== "boolean") throw new Error("社区能力合同不匹配。");
    return { contractVersion: 1, actor: { id: string(actor.id), displayName: string(actor.displayName) }, posts: row.posts, galleryReferences: row.galleryReferences };
  },
  async posts(token: string, page: number, view: string, signal?: AbortSignal) {
    return parsePage(await communityRequest("/posts?page=" + page + "&size=12&view=" + encodeURIComponent(view), token, { signal }), parsePost);
  },
  async post(token: string, postId: string, signal?: AbortSignal) {
    return parsePost(await communityRequest("/posts/" + encodeURIComponent(postId), token, { signal }));
  },
  async comments(token: string, postId: string, page: number, signal?: AbortSignal) {
    return parsePage(await communityRequest("/posts/" + encodeURIComponent(postId) + "/comments?page=" + page + "&size=12", token, { signal }), value => {
      const row = object(value), author = object(row.author);
      return { id: id(row.id), content: string(row.content), createdAt: string(row.createdAt),
        author: { id: string(author.id), displayName: string(author.displayName) } };
    });
  },
  async reference(token: string, paintingId: string, signal?: AbortSignal) {
    return parseReference(await communityRequest("/gallery-references/" + encodeURIComponent(paintingId), token, { signal }));
  },
  async outcome(token: string, requestId: string, signal?: AbortSignal) {
    return parseOutcome(await communityRequest("/operations/" + encodeURIComponent(requestId), token, { signal }));
  },
  async write(token: string, path: string, method: string, payload: object) {
    return parseOutcome(await communityRequest(path, token, { method, body: JSON.stringify(payload) }));
  },
};
/** Only operation handles, never tokens/content/media, survive a reload. */
export function operationStorageKey(actorId: string) { return "artlive.community.pending.v1:" + actorId; }
export function readOperation(value: string | null, actorId: string): OperationHandle | null {
  if (!value) return null;
  const row = object(JSON.parse(value));
  if (row.actorId !== actorId || typeof row.kind !== "string" || !["post", "comment", "like", "favorite", "delete"].includes(row.kind)) throw new Error("待核对操作记录无效，请保留记录并联系管理员。");
  return { actorId, requestId: id(row.requestId), kind: row.kind };
}
export function definiteWriteFailure(error: unknown): boolean {
  return error instanceof ApiError && [400, 401, 403, 404, 409, 413, 415, 429].includes(error.status);
}
