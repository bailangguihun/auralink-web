import { assistantImageFingerprint } from '../lib/assistant-api.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePage, validateAssistantResponse, mergeItems, artworkDisplay, assistantDate, platformCitationFields, ragflowAvailable, webSearchAvailable, assistantRetrievalRequest, assistantGenerationAvailable, assistantGenerationNotice, type Registry } from '../lib/assistant-contracts.ts';
import { resolveMediaUrl } from '../lib/media.ts';
const id = '3b77654a-8c16-42f4-aaec-b1029f7559c3';
test('RAG is an explicit available-registry opt-in independent of platform artworks', () => {
  const registry = (state: string, webState: string = 'NOT_CONFIGURED'): Registry => ({ models: [], retrieval: { state }, webSearch: { state: webState }, configSha256: 'test-only' });
  for (const candidate of [null, ...['DISABLED', 'NOT_CONFIGURED', 'UNAVAILABLE', 'FORBIDDEN', 'TIMEOUT', 'UNKNOWN'].map(state => registry(state))]) {
    assert.equal(ragflowAvailable(candidate), false);
    assert.deepEqual(assistantRetrievalRequest(candidate, true, true), { artworks: true, ragflow: false, web: false });
    assert.deepEqual(assistantRetrievalRequest(candidate, false, true), { artworks: false, ragflow: false, web: false });
  }
  assert.equal(ragflowAvailable(registry('AVAILABLE')), true);
  assert.deepEqual(assistantRetrievalRequest(registry('AVAILABLE'), true, false), { artworks: true, ragflow: false, web: false });
  assert.deepEqual(assistantRetrievalRequest(registry('AVAILABLE'), false, true), { artworks: false, ragflow: true, web: false });
  assert.equal(webSearchAvailable(registry('NOT_CONFIGURED', 'AVAILABLE')), true);
  assert.deepEqual(assistantRetrievalRequest(registry('NOT_CONFIGURED', 'AVAILABLE'), false, false, true), { artworks: false, ragflow: false, web: true });
});
test('Assistant attachment bearer allowlist accepts only fixed UUID content route', () => {
  assert.ok(resolveMediaUrl(`/api/v1/assistant/attachments/${id}/content`));
  for (const path of [`https://untrusted.test/api/v1/assistant/attachments/${id}/content`, `/api/v1/assistant/attachments/${id}/content?token=x`, `/api/v1/assistant/attachments/${id}/../../user`, `/api/v1/assistant/attachments/${id}/download`, `/api/v1/assistant/attachments/secret/content`]) assert.equal(resolveMediaUrl(path), null);
});
test('Full-history pagination rejects silently truncated or malformed continuations', () => {
  assert.deepEqual(parsePage({ items: [], nextCursor: null, hasMore: false }), { items: [], nextCursor: null, hasMore: false });
  assert.throws(() => parsePage({ items: [], nextCursor: null, hasMore: true }));
  assert.throws(() => parsePage({ items: [], hasMore: false }));
  const older = [{ id: 'a', body: 'old' }]; const newer = [{ id: 'b', body: 'new' }];
  assert.deepEqual(mergeItems(older, newer, row => row.id).map(row => row.id), ['a', 'b']);
  assert.equal(mergeItems(newer, [{ id: 'b', body: 'checkpoint' }], row => row.id)[0].body, 'checkpoint');
});
test('Successful malformed private responses are rejected before UI state', () => {
  assert.throws(() => validateAssistantResponse('/status', { enabled: 'true', executionAvailable: true }));
  assert.throws(() => validateAssistantResponse('/models', { models: [{ id: 'route', label: 'label', capabilities: null }] }));
  assert.throws(() => validateAssistantResponse(`/runs/${id}`, { id, sessionId: id, branchId: id, checkpoint: 'x', sequence: 0, status: 'UNKNOWN_SUCCESS' }));
  assert.throws(() => validateAssistantResponse(`/sessions/${id}/messages/page`, { items: [{ id, body: '<script>text is literal</script>', attachmentIds: ['../../private'] }], nextCursor: null, hasMore: false }));
  assert.doesNotThrow(() => validateAssistantResponse('/status', { enabled: false, executionAvailable: false }));
});

test('Artwork selector retains zero/raw uncertainty and ignores non-display fields', () => {
  const fields = [{ key: 'core.author_name', value: '0', rawValue: '0', valueStatus: 'PRESENT', assertionStatus: 'UNRESOLVED' }, { key: 'legacy.creation_dynasty_raw', value: '未知', rawValue: '不详', valueStatus: 'PRESENT', assertionStatus: 'UNKNOWN' }, { key: 'private.path', value: '/private/never-render', rawValue: null, valueStatus: 'PRESENT', assertionStatus: 'UNSPECIFIED' }];
  const rows = artworkDisplay({ artworkId: id, batchId: id, revision: 1, projectionVersion: 'public-v1', sourceRecordId: 'synthetic', fields });
  assert.equal(rows.length, 2); assert.equal(rows[0].value, '0'); assert.equal(rows[0].uncertainty, '待核实'); assert.equal(rows[1].raw, '不详');
  assert.throws(() => validateAssistantResponse('/artworks?query=test', [{ artworkId: '../private', batchId: id, revision: 1, fields }]));
});

test('Core fractional epoch-second Instants and ISO timestamps display the actual year', () => {
  assert.equal(assistantDate(1791938206.678048).getUTCFullYear(), 2026);
  assert.equal(assistantDate('2026-10-14T00:00:00Z').toISOString(), '2026-10-14T00:00:00.000Z');
  assert.equal(assistantDate(1791938206.678048).getTime(), 1791938206678);
});

test('Platform citation JSON is rendered as public labeled text without trusting arbitrary shape', () => {
  const fields = [{ key: 'core.title', value: '<img src=x onerror=alert(1)>', rawValue: null, valueStatus: 'PRESENT', assertionStatus: 'UNSPECIFIED' }];
  assert.equal(platformCitationFields(JSON.stringify(fields))?.[0].value, fields[0].value);
  assert.equal(platformCitationFields('{"title":"not-field-array"}'), null);
  assert.equal(platformCitationFields('<script>evil</script>'), null);
});

test('Oversized image is refused before reading bytes or computing an upload request', async () => {
  let reads = 0;
  await assert.rejects(assistantImageFingerprint({ type: 'image/png', size: 10 * 1024 * 1024 + 1, arrayBuffer: async () => { reads++; return new ArrayBuffer(1); } }), /10 MiB/);
  assert.equal(reads, 0);
  const digest = await assistantImageFingerprint({ type: 'image/png', size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
  assert.equal(digest, '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
});

test('manual generation suspension does not erase execution/history availability or broaden disabled Core', () => {
  const running = { enabled: true, stage: 'EXECUTION', executionAvailable: true };
  assert.equal(assistantGenerationAvailable(running), true);
  const paused = { ...running, generationAvailable: false, generationState: 'ASSISTANT_GENERATION_SUSPENDED' };
  validateAssistantResponse('/status', paused);
  assert.equal(assistantGenerationAvailable(paused), false);
  assert.equal(paused.executionAvailable, true);
  assert.match(assistantGenerationNotice(paused.generationState), /历史与图片仍可查看/);
  assert.match(assistantGenerationNotice(paused.generationState), /可能继续计费/);
  assert.match(assistantGenerationNotice('ASSISTANT_GENERATION_CONTROL_UNAVAILABLE'), /没有自动重新提交/);
  assert.equal(assistantGenerationAvailable({ ...running, executionAvailable: false }), false);
  assert.throws(() => validateAssistantResponse('/status', { ...running, generationAvailable: 'false' }));
  assert.throws(() => validateAssistantResponse('/status', { ...running, executionAvailable: false, generationAvailable: true }));
});
