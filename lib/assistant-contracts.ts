import { parseAssistantStorage } from './assistant-storage.ts';
export type AssistantTimestamp = string | number;
/** Public S2 contracts. No owner credentials, storage paths, or upstream URLs. */
export type AssistantStatus = { enabled: boolean; stage: string; executionAvailable: boolean; generationAvailable?: boolean; generationState?: string; automaticSummaryAvailable?: boolean; summaryTurnThreshold?: number; summaryIdleSeconds?: number; maxSummaryPerHour?: number };
/** Optional for older Core; execution availability is never broadened by the manual control. */
export const assistantGenerationAvailable = (status: AssistantStatus) => status.executionAvailable && status.generationAvailable !== false;
export function assistantGenerationNotice(state: string | undefined): string {
  return state === 'ASSISTANT_GENERATION_SUSPENDED'
    ? '生成已由运营暂停；历史与图片仍可查看。已发送请求可能继续计费。'
    : '生成控制暂不可用；历史与图片仍可查看，没有自动重新提交。';
}
export type AssistantSession = { id: string; title: string; activeBranchId: string; version: number; summaryAutoEnabled: boolean; status: string; createdAt: AssistantTimestamp; updatedAt: AssistantTimestamp };
export type Branch = { id: string; sessionId: string; parentBranchId: string | null; forkMessageId: string | null; headMessageId: string | null; version: number; createdAt: AssistantTimestamp };
export type Message = { id: string; sessionId: string; parentMessageId: string | null; versionGroupId: string; supersedesId: string | null; role: string; body: string; state: string; runId: string | null; createdAt: AssistantTimestamp; attachmentIds: string[] };
export type Run = { id: string; sessionId: string; branchId: string; kind: string; status: string; inputMessageId: string; modelKey: string; sequence: number; checkpoint: string; retryOf: string | null; attempt: number; executionUncertain: boolean; retrieval: Record<string, unknown>; usage: Record<string, unknown>; errorCode: string | null; createdAt: AssistantTimestamp; updatedAt: AssistantTimestamp };
export type Attachment = { id: string; sessionId: string; filename: string; mimeType: string; byteSize: number; sha256: string; width: number; height: number; status: string; contentUrl: string; draftExpiresAt?: AssistantTimestamp | null };
export type Model = { id: string; label: string; providerId: string; modelId: string; configured: boolean; enabled: boolean; capabilities: { images: boolean; streaming: boolean; imageMimeTypes: string[] }; evidence: string };
export type Registry = { models: Model[]; retrieval: { state: string }; webSearch?: { state: string }; configSha256: string };
/** Core's registry is authoritative; an old checkbox value cannot enable an unavailable adapter. */
export const ragflowAvailable = (registry: Registry | null) => registry?.retrieval?.state === 'AVAILABLE';
export const webSearchAvailable = (registry: Registry | null) => registry?.webSearch?.state === 'AVAILABLE';
export const assistantRetrievalRequest = (registry: Registry | null, artworks: boolean, ragflow: boolean, web: boolean = false) => ({ artworks, ragflow: ragflowAvailable(registry) && ragflow, web: webSearchAvailable(registry) && web });
export type Citation = { id: string; ordinal: number; sourceType: 'PLATFORM_ARTWORK' | 'RAGFLOW_DOCUMENT' | 'WEB_RESULT'; sourceId: string; sourceVersion: string; projectionVersion: string; provenance: Record<string, unknown>; excerpt: string; excerptSha256: string };
export type Choice = { runId: string; sourceMessageId: string; id: string; title: string; options: { id: string; label: string; text: string }[] };
export type Summary = { id: string; branch_id: string; current_run_id: string; body: string; status: string; model_id: string; stale: boolean; usage: Record<string, unknown> };
export type Timeline = { messageId: string; role: string; state: string; body: string; classification: string; classificationSource: string; classificationVersion: number; classifierVersion: string; runs: Run[]; createdAt: AssistantTimestamp };
export type Page<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };
export const terminal = (state: string) => ['COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(state);
export const stateLabel = (state: string) => ({ QUEUED: '排队中', EXECUTING: '生成中', COMPLETED: '已完成', FAILED: '失败', CANCELLED: '已取消', INTERRUPTED: '结果不确定／已中断', ACCEPTED: '已保存' }[state] || state);
export const retrievalLabel = (state: unknown) => typeof state === 'string' ? ({ DISABLED: '未启用', NOT_CONFIGURED: '未配置', AVAILABLE: '可用', EMPTY: '无结果', FORBIDDEN: '无权限', TIMEOUT: '超时', UNAVAILABLE: '暂不可用' }[state] || state) : '未知';
export const stageLabels = ['灵感构思', '资料参考', '构图规划', '笔墨技法', '设色处理', '题款钤印', '修改完善', '作品审视', '创作交流'];
export function parsePage<T>(value: unknown): Page<T> {
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items) || !('hasMore' in value) || typeof value.hasMore !== 'boolean' || !('nextCursor' in value) || (value.nextCursor !== null && typeof value.nextCursor !== 'string') || (value.hasMore && !value.nextCursor)) throw new Error('Assistant 分页响应不完整，请重新读取。');
  return value as Page<T>;
}
export function mergeItems<T>(previous: T[], incoming: T[], id: (value: T) => string): T[] {
  const values = new Map(previous.map(value => [id(value), value]));
  incoming.forEach(value => values.set(id(value), value)); return [...values.values()];
}
/** Reject malformed successful payloads before they reach private view state. */
export function validateAssistantResponse(path: string, value: unknown): void {
  const fail = () => { throw new Error('Assistant 返回的数据不符合当前接口，请重新读取；没有重新发起生成。'); };
  const object = (item: unknown): Record<string, unknown> => { if (!item || typeof item !== 'object' || Array.isArray(item)) return fail(); return item as Record<string, unknown>; };
  const uuid = (item: unknown) => typeof item === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item);
  const run = (item: unknown) => { const row = object(item); if (!uuid(row.id) || !uuid(row.sessionId) || !uuid(row.branchId) || typeof row.checkpoint !== 'string' || !Number.isSafeInteger(row.sequence) || typeof row.status !== 'string' || !['QUEUED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(row.status)) fail(); };
  const message = (item: unknown) => { const row = object(item); if (!uuid(row.id) || typeof row.body !== 'string' || !Array.isArray(row.attachmentIds) || !row.attachmentIds.every(uuid)) fail(); };
  const artwork = (item: unknown) => {
    const row = object(item);
    if (!uuid(row.artworkId) || !uuid(row.batchId) || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1 || typeof row.projectionVersion !== 'string' || typeof row.sourceRecordId !== 'string' || !Array.isArray(row.fields) || row.fields.length > 50) fail();
    for (const raw of row.fields as unknown[]) { const field = object(raw); if (typeof field.key !== 'string' || (field.value !== null && typeof field.value !== 'string') || (field.rawValue !== null && typeof field.rawValue !== 'string') || typeof field.valueStatus !== 'string' || typeof field.assertionStatus !== 'string') fail(); }
  };
  const address = path.split('?')[0];
  if (address === '/storage') { parseAssistantStorage(value); }
  else if (address === '/status') { const row = object(value); if (typeof row.enabled !== 'boolean' || typeof row.executionAvailable !== 'boolean' || (row.generationAvailable !== undefined && typeof row.generationAvailable !== 'boolean') || (row.generationState !== undefined && typeof row.generationState !== 'string') || (row.generationAvailable === true && row.executionAvailable !== true)) fail(); }
  else if (address === '/models') { const row = object(value); if (!Array.isArray(row.models)) return fail(); for (const model of row.models) { const entry = object(model); const capabilities = object(entry.capabilities); if (typeof entry.id !== 'string' || typeof entry.label !== 'string' || typeof entry.enabled !== 'boolean' || typeof entry.configured !== 'boolean' || typeof capabilities.images !== 'boolean' || typeof capabilities.streaming !== 'boolean') fail(); } }
  else if (address === '/artworks') { if (!Array.isArray(value)) return fail(); value.forEach(artwork); }
  else if (address === '/artworks/page') {
    const row = object(value);
    if (!Array.isArray(row.items) || ![row.totalElements, row.totalPages, row.page, row.size].every(Number.isSafeInteger) || Number(row.totalElements) < 0 || Number(row.page) < 0 || Number(row.size) < 1 || Number(row.size) > 10 || Number(row.totalPages) !== Math.ceil(Number(row.totalElements) / Number(row.size)) || row.items.length > Number(row.size) || row.items.length > Number(row.totalElements)) return fail();
    row.items.forEach(artwork);
    if (new Set(row.items.map(item => object(item).artworkId)).size !== row.items.length) fail();
  }
  else if (/^\/artworks\/[^/]+$/.test(address)) artwork(value);
  else if (/\/page$/.test(address)) {
    const page = parsePage<unknown>(value);
    if (address.includes('/messages/')) page.items.forEach(message);
    else if (address.includes('/runs/')) page.items.forEach(run);
    else for (const item of page.items) {
      const row = object(item);
      if (address.includes('/timeline/')) { if (!uuid(row.messageId) || typeof row.body !== 'string' || !Number.isSafeInteger(row.classificationVersion)) fail(); }
      else { if (!uuid(row.id)) fail(); if (address.includes('/summaries/') && typeof row.body !== 'string') fail(); if (address === '/sessions/page' && (typeof row.title !== 'string' || !uuid(row.activeBranchId) || !Number.isSafeInteger(row.version))) fail(); if (address.includes('/branches/') && (!uuid(row.sessionId) || !Number.isSafeInteger(row.version))) fail(); }
    }
  }
  else if (/^\/runs\/[^/]+(?:\/cancel)?$/.test(address)) run(value);
  else if (/\/(?:runs|edited-runs|retry|retrievals)$/.test(address)) run(object(value).run);
  else if (/^\/sessions\/[^/]+\/attachments\/draft$/.test(address)) { const page = parsePage<unknown>(value); for (const item of page.items) { const row = object(item); if (!uuid(row.id) || !uuid(row.sessionId) || row.status !== 'READY' || typeof row.contentUrl !== 'string' || !['image/png', 'image/jpeg'].includes(String(row.mimeType)) || !row.draftExpiresAt) fail(); } }
  else if (/^\/attachments\/[^/]+$/.test(address) && value !== undefined) { const row = object(value); if (!uuid(row.id) || typeof row.contentUrl !== 'string' || !['image/png', 'image/jpeg'].includes(String(row.mimeType))) fail(); }
}

export type ArtworkReference = { artworkId: string; batchId: string; revision: number; projectionVersion: string; sourceRecordId: string; fieldTextLimit?: number; fields: { key: string; value: string | null; rawValue: string | null; valueStatus: string; assertionStatus: string }[] };
export function publicArtworkFields(fields: ArtworkReference['fields']) {
  const labels: Record<string, string> = { 'core.title': '作品名', 'legacy.title': '作品名', 'legacy.painting_name': '作品名', 'core.author_name': '作者名称', 'legacy.author_name': '作者名称', 'legacy.creation_dynasty_raw': '朝代', 'core.category': '分类', 'legacy.category': '分类', 'legacy.subject': '题材', 'legacy.painting_school': '画派', 'legacy.style': '风格', 'annotation.style': '风格', 'annotation.subject_secondary': '次级题材', 'legacy.color': '设色', 'legacy.composition': '构图', 'legacy.artistic_conception': '意境', 'legacy.brushwork': '笔法', 'legacy.ink_method': '墨法', 'legacy.painting_material': '材料', 'legacy.cultural_symbol': '文化意象', 'legacy.collection_institution': '收藏机构', 'legacy.collection_platform': '收录平台' };
  return fields.filter(field => labels[field.key]).map(field => ({ label: labels[field.key], value: field.value || field.rawValue || '未提供', raw: field.rawValue && field.rawValue !== field.value ? field.rawValue : null, uncertainty: field.value === '0' || field.assertionStatus === 'UNRESOLVED' ? '待核实' : field.assertionStatus === 'UNKNOWN' || field.valueStatus === 'MISSING' ? '未知或缺失' : field.assertionStatus === 'UNSPECIFIED' ? '未独立核验' : field.assertionStatus }));
}

export function assistantDate(value: AssistantTimestamp): Date {
  // Core Jackson's numeric Instant serialization is epoch seconds (including nanos), not JS milliseconds.
  return new Date(typeof value === 'number' ? value * 1000 : value);
}

export const artworkDisplay = (artwork: ArtworkReference) => publicArtworkFields(artwork.fields);
export function platformCitationFields(excerpt: string) {
  try { const fields = JSON.parse(excerpt); if (!Array.isArray(fields) || fields.length > 50 || !fields.every(field => field && typeof field.key === 'string' && (typeof field.value === 'string' || field.value === null) && (typeof field.rawValue === 'string' || field.rawValue === null) && typeof field.valueStatus === 'string' && typeof field.assertionStatus === 'string')) return null; return publicArtworkFields(fields); } catch { return null; }
}
