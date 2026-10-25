import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantMarkdownLink, assertAssistantSources } from '../lib/assistant-presentation.ts';
import type { Run } from '../lib/assistant-contracts.ts';

test('Markdown permits only explicit public HTTP links, never executable, private or relative URLs', () => {
  for (const value of [undefined, '', 'javascript:alert(1)', 'data:text/html,test', '//example.org', '/api/v1/private', 'https://user:secret@example.org', 'file:///etc/passwd', 'https://', 'java\nscript:alert(1)']) assert.equal(assistantMarkdownLink(value), null, String(value));
  assert.equal(assistantMarkdownLink('https://example.org/a?b=c#d'), 'https://example.org/a?b=c#d');
});
test('Sources require the exact persisted message run and session, not a model citation number', () => {
  const message = { runId: 'run-a', sessionId: 'session-a' };
  const run = { id: 'run-a', sessionId: 'session-a', branchId: 'ancestor-branch' } as Run;
  const citation = { id: 'citation-a', ordinal: 1, sourceId: 'artwork-a', sourceType: 'PLATFORM_ARTWORK', excerpt: 'snapshot', excerptSha256: 'a'.repeat(64), provenance: { deliveryEvidence: 'LOOKUP_ONLY' } };
  assert.doesNotThrow(() => assertAssistantSources(message, run, [citation]));
  assert.doesNotThrow(() => assertAssistantSources(message, run, []));
  assert.throws(() => assertAssistantSources(message, { ...run, id: 'run-b' }, [citation]), /身份/);
  assert.throws(() => assertAssistantSources(message, { ...run, sessionId: 'session-b' }, [citation]), /身份/);
  for (const invalid of [null, '[1]', [1], [{ ...citation, provenance: null }], [{ ...citation, sourceType: 'MODEL_SAID_SO' }]]) assert.throws(() => assertAssistantSources(message, run, invalid), /格式/);
});
