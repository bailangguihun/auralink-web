import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantMarkdownLink, assistantVisibleMarkdown, assistantIllustratedSections, assertAssistantSources } from '../lib/assistant-presentation.ts';
import type { Run } from '../lib/assistant-contracts.ts';

test('Markdown permits only explicit public HTTP links, never executable, private or relative URLs', () => {
  for (const value of [undefined, '', 'javascript:alert(1)', 'data:text/html,test', '//example.org', '/api/v1/private', 'https://user:secret@example.org', 'file:///etc/passwd', 'https://', 'java\nscript:alert(1)']) assert.equal(assistantMarkdownLink(value), null, String(value));
  for (const value of ['http://localhost/private', 'http://127.0.0.1/private', 'http://10.0.0.2/private', 'http://192.168.1.2/private', 'http://172.16.0.2/private']) assert.equal(assistantMarkdownLink(value), null, value);
  assert.equal(assistantMarkdownLink('https://example.org/a?b=c#d'), 'https://example.org/a?b=c#d');
});
test('Assistant presentation removes transport choices and internal retrieval diagnostics', () => {
  const choice = '[{"id":"versions","title":"想了解哪个版本？","options":[{"id":"song","label":"北宋"}]}]';
  const disclosure = '关于《清明上河图》，由于本轮对话中未启用且未配置任何检索工具（reference_data 显示 artworks 和 ragflow 均为 DISABLED），回答仅基于我内部的一般知识储备。';
  assert.equal(assistantVisibleMarkdown(`${disclosure}\n\n## 基本概况\n\n正文\n\n${choice}`), '## 基本概况\n\n正文');
  assert.equal(assistantVisibleMarkdown(`\`\`\`choice\n${choice}\n\`\`\`\n\n后续内容`), '后续内容');
  const typographicChoice = '[{“id”： “interpretation”，“title”： “您更倾向哪种解读？”，“options”： [{“id”： “social_history”，“label”： “社会历史实证”},{“id”： “political_allegory”，“label”： “政治寓意”}]}]';
  assert.equal(assistantVisibleMarkdown(`正文\n\n    ${typographicChoice}`), '正文');
  assert.equal(assistantVisibleMarkdown('【资料检索状态：web=TIMEOUT；以下回答不代表已获得该来源的证据。】\n\n正文'), '正文');
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

test('Historical choice fences and pretty printed cards stay out of the visible answer', () => {
  const cards = JSON.stringify([{ id: 'one', title: '确认作者', options: [{id:'a',label:'题款'}, {id:'b',label:'收藏'}] },
    { id: 'two', title: '深入意象', options: [{id:'a',label:'古树'}, {id:'b',label:'飞鸟'}] }], null, 2).replace('  {\n    "id": "two"', '\n  {\n    "id": "two"');
  for (const suffix of [cards, `\`\`\`assistant-choices\n${cards}\n\`\`\``, '\`\`\`assistant-choices\n[{"id":"partial"']) {
    assert.equal(assistantVisibleMarkdown(`画面分析。\n\n${suffix}`), '画面分析。');
  }
  assert.match(assistantVisibleMarkdown('题款转录\n\n\`\`\`json\n{"year":1690}\n\`\`\`'), /1690/);
});

test('Illustrated analysis resolves only bounded crops of the current question attachments', () => {
  const text = '整体感受。\n\n### 古树与岁月\n![古树](assistant-crop:1,0.1,0.2,0.4,0.5)\n枝干向上伸展。';
  const sections = assistantIllustratedSections(text, ['private-current-image']);
  assert.equal(sections[1].image?.id, 'private-current-image');
  assert.deepEqual(sections[1].image?.crop, { x: 0.1, y: 0.2, width: 0.4, height: 0.5 });
  assert.match(sections[1].markdown, /枝干/);
  assert.doesNotMatch(sections[1].markdown, /assistant-crop/);
  assert.equal(assistantIllustratedSections(text, [])[1].image, undefined);
  for (const coordinates of ['2,0,0,1,1', '1,0.9,0,0.4,1', '1,-1,0,1,1', '1,0,0,0,1', '1,NaN,0,1,1', 'https://example.com/private']) {
    assert.equal(assistantIllustratedSections(text.replace('1,0.1,0.2,0.4,0.5', coordinates), ['private-current-image'])[1].image, undefined);
  }
  const code = '\`\`\`text\n### heading in code\n\`\`\`';
  assert.deepEqual(assistantIllustratedSections(code, []), [{ markdown: code }]);
});
