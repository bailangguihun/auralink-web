import { ApiError, toApiError } from "./api.ts";
import type { PaintingImage } from "./types.ts";

export type GalleryReference = { state: "AVAILABLE" | "UNAVAILABLE" | "UNVERIFIED"; paintingId: string; title?: string; authorName?: string; period?: string; image?: PaintingImage | null };
export const critiqueDimensions = ["构图", "笔墨", "设色", "造型", "意境", "题款", "综合"] as const;
export type CommunityImage = { id: string; filename: string; mimeType: string; bytes: number; width: number; height: number; sha256: string; previewUrl: string; contentUrl: string };
export type CommunityPost = {
  id: string; content: string; author: { id: string; displayName: string }; createdAt: string;
  commentCount: number; likeCount: number; liked: boolean; favorited: boolean; galleryReference: GalleryReference | null;
  title: string; kind: "discussion" | "artwork"; creationStage: string; creationGoal: string;
  helpTopics: string[]; tags: string[]; workflowStatus: string; updatedAt: string; images: CommunityImage[]; canEdit: boolean;
};
export type CommunityComment = Pick<CommunityPost, "id" | "content" | "author" | "createdAt"> & {
  parentId: string | null; replyName: string | null; dimension: string | null; suggestion: string; adopted: boolean; revisionId: string | null; revisionNumber: number | null;
};
export type CommunityPage<T> = { items: T[]; page: number; hasNext: boolean };
export type OperationResult = { kind: string; postId?: string; commentId?: string; assetId?: string; revisionId?: string; caseId?: string; enabled?: boolean };
export type OperationOutcome = { state: "COMMITTED" | "NOT_OBSERVED"; result: OperationResult | null };
export type OperationHandle = { requestId: string; actorId: string; kind: string };
export type CommunityCapabilities = { contractVersion: number; actor: { id: string; displayName: string }; posts: boolean; galleryReferences: boolean; uploads: boolean; growth: boolean; search: boolean; notifications: boolean; cases: boolean };
export type CommunityFilters = { view: string; kind: string; workflow: string; q: string; tag: string; sort: string; page: number; tab: string };
export type CommunityTask = { id: string; content: string; dimension: string; status: "todo" | "done"; sourceCommentId: string };
export type CommunityRevision = { id: string; versionNumber: number; note: string; reflection: string; reviewStatus: string; createdAt: string; images: CommunityImage[] };
export type CommunityCase = { id: string; postId: string; title: string; summary: string; lessons: { dimension: string; observation: string; suggestion: string; commentId: string }[]; dimensions: string[]; status: string; updatedAt: string; source: string };
export type CommunityGrowth = { tasks: CommunityTask[]; revisions: CommunityRevision[]; caseCard: CommunityCase | null; source: string };
export type CommunityNotice = { id: string; postId: string; kind: string; actorName: string; postTitle: string; read: boolean; createdAt: string };
const operationKinds = ["post", "comment", "like", "favorite", "delete", "upload", "edit", "adopt", "workflow", "tasks", "task", "revision", "review", "case", "case-edit", "read"];
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
  const parsed: OperationResult = { kind: string(result.kind) };
  if (!operationKinds.includes(parsed.kind)) throw new Error("操作结果尚未确认。");
  if (parsed.kind === "upload") parsed.assetId = id(result.assetId); else parsed.postId = id(result.postId);
  if (result.revisionId !== undefined) parsed.revisionId = id(result.revisionId);
  if (result.caseId !== undefined) parsed.caseId = id(result.caseId);
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
  let image: PaintingImage | null = null;
  if (row.image && typeof row.image === "object" && !Array.isArray(row.image)) {
    const source = row.image as Record<string, unknown>;
    if (typeof source.assetId === "string" && uuidPattern.test(source.assetId)
      && source.contentUrl === `/api/v1/assets/${source.assetId}/content`) {
      const positive = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0 ? value as number : null;
      image = {
        assetId: source.assetId, contentUrl: source.contentUrl,
        downloadUrl: `/api/v1/assets/${source.assetId}/download`,
        mimeType: typeof source.mimeType === "string" && /^image\/[a-z0-9.+-]+$/i.test(source.mimeType) ? source.mimeType : "",
        width: positive(source.width), height: positive(source.height), fileSize: positive(source.fileSize),
      };
    }
  }
  return { state: "AVAILABLE", paintingId, title: string(row.title), authorName: string(row.authorName), period: string(row.period), image };
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
    title: typeof row.title === "string" ? row.title : "", kind: row.kind === "artwork" ? "artwork" : "discussion",
    creationStage: typeof row.creationStage === "string" ? row.creationStage : "", creationGoal: typeof row.creationGoal === "string" ? row.creationGoal : "",
    helpTopics: textList(row.helpTopics), tags: textList(row.tags), workflowStatus: typeof row.workflowStatus === "string" ? row.workflowStatus : "sharing",
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : string(row.createdAt), images: list(row.images, parseCommunityImage), canEdit: row.canEdit === true,
  };
}
function textList(value: unknown): string[] { return value === undefined ? [] : list(value, string); }
function list<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200) throw new Error("社区列表返回格式不完整。");
  return value.map(parse);
}
export function parseCommunityImage(value: unknown): CommunityImage {
  const row = object(value), assetId = id(row.id);
  if (row.contentUrl !== `/api/community/media/${assetId}` || row.previewUrl !== `/api/community/media/${assetId}?variant=preview`
    || !["image/jpeg", "image/png", "image/webp"].includes(string(row.mimeType))) throw new Error("社区图片地址无效。");
  for (const key of ["width", "height", "bytes"]) if (!Number.isSafeInteger(row[key]) || (row[key] as number) <= 0) throw new Error("社区图片信息不完整。");
  const sha256 = string(row.sha256); if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("社区图片信息不完整。");
  return { id: assetId, filename: string(row.filename), mimeType: string(row.mimeType), bytes: row.bytes as number,
    width: row.width as number, height: row.height as number, sha256, previewUrl: row.previewUrl as string, contentUrl: row.contentUrl as string };
}
function parseCase(value: unknown): CommunityCase {
  const row = object(value);
  return { id: id(row.id), postId: id(row.postId), title: string(row.title), summary: string(row.summary),
    dimensions: textList(row.dimensions), status: string(row.status), updatedAt: string(row.updatedAt), source: string(row.source),
    lessons: list(row.lessons, item => { const line = object(item); return { dimension: string(line.dimension), observation: string(line.observation), suggestion: string(line.suggestion), commentId: id(line.commentId) }; }) };
}
function parseGrowth(value: unknown): CommunityGrowth {
  const row = object(value);
  return { source: string(row.source), caseCard: row.caseCard === null ? null : parseCase(row.caseCard),
    tasks: list(row.tasks, value => { const task = object(value); if (!["todo", "done"].includes(string(task.status))) throw new Error("任务状态无效。");
      return { id: id(task.id), content: string(task.content), dimension: string(task.dimension), status: task.status as "todo" | "done", sourceCommentId: id(task.sourceCommentId) }; }),
    revisions: list(row.revisions, value => { const revision = object(value); if (!Number.isInteger(revision.versionNumber) || (revision.versionNumber as number) < 2) throw new Error("作品版本无效。");
      return { id: id(revision.id), versionNumber: revision.versionNumber as number, note: string(revision.note), reflection: string(revision.reflection), reviewStatus: string(revision.reviewStatus), createdAt: string(revision.createdAt), images: list(revision.images, parseCommunityImage) }; }) };
}
function parsePage<T>(value: unknown, item: (value: unknown) => T): CommunityPage<T> {
  const row = object(value);
  if (!Array.isArray(row.items) || !Number.isSafeInteger(row.page) || (row.page as number) < 0 || typeof row.hasNext !== "boolean") throw new Error("社区列表返回格式不完整。");
  return { items: row.items.map(item), page: row.page as number, hasNext: row.hasNext };
}
export async function communityRequest(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(options.headers);
  headers.set("authorization", "Bearer " + token);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch("/api/community" + path, { ...options, cache: "no-store", redirect: "error",
    headers });
  let value: unknown;
  try { value = await response.json(); } catch { throw new Error("社区响应尚未确认，请读取操作结果。"); }
  if (!response.ok) throw toApiError(response.status, value);
  return value;
}
export const communityApi = {
  async capabilities(token: string, signal?: AbortSignal): Promise<CommunityCapabilities> {
    const row = object(await communityRequest("/capabilities", token, { signal })), actor = object(row.actor);
    if (row.contractVersion !== 1 || typeof row.posts !== "boolean" || typeof row.galleryReferences !== "boolean") throw new Error("社区能力合同不匹配。");
    return { contractVersion: 1, actor: { id: string(actor.id), displayName: string(actor.displayName) }, posts: row.posts, galleryReferences: row.galleryReferences,
      uploads: row.uploads === true, growth: row.growth === true, search: row.search === true, notifications: row.notifications === true, cases: row.cases === true };
  },
  async posts(token: string, page: number, view: string, signal?: AbortSignal, filters?: Partial<CommunityFilters>) {
    const params = new URLSearchParams({ page: String(page), size: "12", view });
    for (const key of ["kind", "workflow", "q", "tag", "sort"] as const) if (filters?.[key]) params.set(key, filters[key]!);
    return parsePage(await communityRequest("/posts?" + params, token, { signal }), parsePost);
  },
  async post(token: string, postId: string, signal?: AbortSignal) {
    return parsePost(await communityRequest("/posts/" + encodeURIComponent(postId), token, { signal }));
  },
  async comments(token: string, postId: string, page: number, signal?: AbortSignal) {
    return parsePage(await communityRequest("/posts/" + encodeURIComponent(postId) + "/comments?page=" + page + "&size=12", token, { signal }), value => {
      const row = object(value), author = object(row.author);
      return { id: id(row.id), content: string(row.content), createdAt: string(row.createdAt),
        author: { id: string(author.id), displayName: string(author.displayName) }, parentId: row.parentId ? id(row.parentId) : null,
        replyName: typeof row.replyName === "string" ? row.replyName : null, dimension: typeof row.dimension === "string" ? row.dimension : null,
        suggestion: typeof row.suggestion === "string" ? row.suggestion : "", adopted: row.adopted === true,
        revisionId: row.revisionId ? id(row.revisionId) : null, revisionNumber: Number.isInteger(row.revisionNumber) ? row.revisionNumber as number : null };
    });
  },
  async comment(token: string, commentId: string, signal?: AbortSignal) {
    const row = object(await communityRequest(`/comments/${id(commentId)}`, token, { signal })), author = object(row.author);
    return { id: id(row.id), postId: id(row.postId), content: string(row.content), suggestion: string(row.suggestion),
      dimension: row.dimension === null ? null : string(row.dimension), createdAt: string(row.createdAt), authorName: string(author.displayName) };
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
  async image(token: string, assetId: string, signal?: AbortSignal) {
    return parseCommunityImage(await communityRequest(`/media/${id(assetId)}/metadata`, token, { signal }));
  },
  async upload(token: string, file: File, requestId: string) {
    return parseOutcome(await communityRequest("/uploads", token, { method: "POST", body: file,
      headers: { "content-type": file.type, "x-request-id": id(requestId), "x-file-name": encodeURIComponent(file.name) } }));
  },
  async imageBlob(token: string, assetId: string, original = false, signal?: AbortSignal) {
    const response = await fetch(`/api/community/media/${id(assetId)}${original ? "" : "?variant=preview"}`, { cache: "no-store", redirect: "error", signal, headers: { authorization: "Bearer " + token } });
    if (!response.ok) throw toApiError(response.status, await response.json().catch(() => null));
    if (!response.headers.get("content-type")?.startsWith("image/")) throw new Error("图片响应无效。");
    return response.blob();
  },
  async growth(token: string, postId: string, signal?: AbortSignal) {
    return parseGrowth(await communityRequest(`/posts/${id(postId)}/growth`, token, { signal }));
  },
  async cases(token: string, page: number, query: string, dimension: string, signal?: AbortSignal) {
    return parsePage(await communityRequest(`/cases?${new URLSearchParams({ page: String(page), size: "12", q: query, dimension })}`, token, { signal }), parseCase);
  },
  async tags(token: string, signal?: AbortSignal) {
    const row = object(await communityRequest("/tags", token, { signal })); return list(row.items, item => { const tag = object(item); return { tag: string(tag.tag), count: Number(tag.count) }; });
  },
  async notifications(token: string, page: number, signal?: AbortSignal) {
    const value = object(await communityRequest(`/notifications?page=${page}&size=12`, token, { signal }));
    return { ...parsePage(value, item => { const row = object(item); return { id: id(row.id), postId: id(row.postId), kind: string(row.kind), actorName: string(row.actorName), postTitle: string(row.postTitle), read: row.read === true, createdAt: string(row.createdAt) }; }), unread: Number(value.unread) };
  },
};
/** Only operation handles, never tokens/content/media, survive a reload. */
export function operationStorageKey(actorId: string) { return "artlive.community.pending.v1:" + actorId; }
export function readOperation(value: string | null, actorId: string): OperationHandle | null {
  if (!value) return null;
  const row = object(JSON.parse(value));
  if (row.actorId !== actorId || typeof row.kind !== "string" || !operationKinds.includes(row.kind)) throw new Error("待核对操作记录无效，请保留记录并联系管理员。");
  return { actorId, requestId: id(row.requestId), kind: row.kind };
}
export function definiteWriteFailure(error: unknown): boolean {
  return error instanceof ApiError && [400, 401, 403, 404, 409, 413, 415, 429].includes(error.status);
}
