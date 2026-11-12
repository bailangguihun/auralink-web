import { parseCommunityImage, type CommunityImage } from "./community.ts";

export type CommunityDraft = { content: string; title: string; kind: "discussion" | "artwork"; stage: string; goal: string; topics: string[]; tags: string; images: CommunityImage[]; paintingId: string | null; source?: string };
export const emptyCommunityDraft = (): CommunityDraft => ({ content: "", title: "", kind: "discussion", stage: "创作", goal: "", topics: [], tags: "", images: [], paintingId: null });
export const communityDraftKey = (actorId: string) => "artlive.community.draft.v2:" + actorId;
export function readCommunityDraft(value: string | null, actorId: string, now = Date.now()): CommunityDraft | null {
  if (!value) return null;
  try {
    const row = JSON.parse(value);
    if (row.actorId !== actorId || !Number.isFinite(row.savedAt) || now - row.savedAt > 24 * 60 * 60 * 1000 || row.savedAt > now + 60_000) return null;
    const draft = row.draft;
    if (!draft || !["discussion", "artwork"].includes(draft.kind)) return null;
    for (const [key, max] of [["content", 32000], ["title", 100], ["stage", 16], ["goal", 1000], ["tags", 200]] as const) if (typeof draft[key] !== "string" || [...draft[key]].length > max) return null;
    if (!Array.isArray(draft.topics) || draft.topics.length > 6 || draft.topics.some((x: unknown) => typeof x !== "string")) return null;
    if (!Array.isArray(draft.images) || draft.images.length > 9) return null;
    if (draft.paintingId !== null && (typeof draft.paintingId !== "string" || !/^[0-9a-f-]{36}$/.test(draft.paintingId))) return null;
    return { content: draft.content, title: draft.title, kind: draft.kind, stage: draft.stage, goal: draft.goal, topics: draft.topics, tags: draft.tags,
      images: draft.images.map(parseCommunityImage), paintingId: draft.paintingId, ...(typeof draft.source === "string" ? { source: draft.source.slice(0, 300) } : {}) };
  } catch { return null; }
}
export function saveCommunityDraft(storage: Pick<Storage, "setItem">, actorId: string, draft: CommunityDraft) {
  storage.setItem(communityDraftKey(actorId), JSON.stringify({ actorId, savedAt: Date.now(), draft }));
}

export type CommunityHandoff = { target: "assistant" | "community"; text: string; postId?: string; title?: string; imageIds?: string[]; galleryPaintingId?: string | null };
export const communityHandoffKey = (actorId: string) => "artlive.community.handoff.v1:" + actorId;
export function readCommunityHandoff(value: string | null, actorId: string, now = Date.now()): CommunityHandoff | null {
  if (!value) return null;
  try {
    const row = JSON.parse(value), handoff = row.handoff;
    if (row.actorId !== actorId || !Number.isFinite(row.savedAt) || now - row.savedAt > 60 * 60 * 1000 || row.savedAt > now + 60_000
      || !handoff || !["assistant", "community"].includes(handoff.target) || typeof handoff.text !== "string" || handoff.text.length > 32000) return null;
    if (handoff.postId && !/^[0-9a-f-]{36}$/.test(handoff.postId)) return null;
    if (handoff.galleryPaintingId && !/^[0-9a-f-]{36}$/.test(handoff.galleryPaintingId)) return null;
    if (handoff.imageIds && (!Array.isArray(handoff.imageIds) || handoff.imageIds.length > 9 || handoff.imageIds.some((id: unknown) => typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)))) return null;
    return { target: handoff.target, text: handoff.text, ...(handoff.postId ? { postId: handoff.postId } : {}),
      title: typeof handoff.title === "string" ? handoff.title.slice(0, 100) : "", imageIds: handoff.imageIds || [], galleryPaintingId: handoff.galleryPaintingId || null };
  } catch { return null; }
}
export function saveCommunityHandoff(storage: Pick<Storage, "setItem">, actorId: string, handoff: CommunityHandoff) {
  storage.setItem(communityHandoffKey(actorId), JSON.stringify({ actorId, savedAt: Date.now(), handoff }));
}
