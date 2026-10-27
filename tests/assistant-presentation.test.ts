import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantMarkdownLink, assistantVisibleMarkdown, assertAssistantSources } from '../lib/assistant-presentation.ts';
import type { Run } from '../lib/assistant-contracts.ts';

test('Markdown permits only explicit public HTTP links, never executable, private or relative URLs', () => {
  for (const value of [undefined, '', 'javascript:alert(1)', 'data:text/html,test', '//example.org', '/api/v1/private', 'https://user:secret@example.org', 'file:///etc/passwd', 'https://', 'java\nscript:alert(1)']) assert.equal(assistantMarkdownLink(value), null, String(value));
  assert.equal(assistantMarkdownLink('https://example.org/a?b=c#d'), 'https://example.org/a?b=c#d');
});
test('Assistant presentation removes transport choices and internal retrieval diagnostics', () => {
  const choice = '[{"id":"versions","title":"想了解哪个版本？","options":[{"id":"song","label":"北宋"}]}]';
  const disclosure = '关于《清明上河图》，由于本轮对话中未启用且未配置任何检索工具（reference_data 显示 artworks 和 ragflow 均为 DISABLED），回答仅基于我内部的一般知识储备。';
  assert.equal(assistantVisibleMarkdown(`${disclosure}\n\n## 基本概况\n\n正文\n\n${choice}`), '## 基本概况\n\n正文');
  assert.equal(assistantVisibleMarkdown(`\`\`\`choice\n${choice}\n\`\`\`\n\n后续内容`), '后续内容');
  assert.match(assistantVisibleMarkdown('```json\n{"ordinary":true}\n```'), /ordinary/);
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
