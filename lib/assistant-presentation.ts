import type { Citation, Message, Run } from './assistant-contracts.ts';

const retrievalDisclosure = /(?:reference_data|artworks\s*(?:和|and)\s*ragflow|\b(?:artworks|ragflow)\b[^\n]{0,80}\bDISABLED\b|未启用且未配置任何检索工具|回答仅基于[^\n]{0,80}一般知识储备|并非来自[^\n]{0,80}(?:数据库记录|权威文献引用))/i;

function structuredChoice(value: unknown): boolean {
  const cards = Array.isArray(value) ? value : [value];
  return cards.length > 0 && cards.every(card => card && typeof card === 'object'
    && typeof (card as { id?: unknown }).id === 'string'
    && typeof (card as { title?: unknown }).title === 'string'
    && Array.isArray((card as { options?: unknown }).options));
}

function choiceJson(value: string): boolean {
  try { return structuredChoice(JSON.parse(value)); } catch { return false; }
}

/** Hide transport-only choice payloads and internal retrieval diagnostics from readers. */
export function assistantVisibleMarkdown(value: string): string {
  const withoutChoiceFences = value.replace(/```(?:choice|json)?\s*\n([\s\S]*?)```/gi, (block, body: string) => choiceJson(body.trim()) ? '' : block);
  return withoutChoiceFences.split(/\n\s*\n/).filter(block => {
    const text = block.trim();
    if (!text) return false;
    if (retrievalDisclosure.test(text)) return false;
    return !((text.startsWith('[') || text.startsWith('{')) && choiceJson(text));
  }).join('\n\n').trim();
}

/** Text links require a deliberate click; no model-authored URL is used as media. */
export function assistantMarkdownLink(value: string | undefined): string | null {
  if (!value || !/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return !url.username && !url.password && ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

/** Verify association, not the truth of a source's claims. Historical branch runs may be ancestors. */
export function assertAssistantSources(message: Pick<Message, 'runId' | 'sessionId'>, run: Run, citations: unknown): asserts citations is Citation[] {
  if (!message.runId || run.id !== message.runId || run.sessionId !== message.sessionId) throw new Error('来源执行身份与这条消息不一致；没有展示其他记录。');
  if (!Array.isArray(citations) || !citations.every(item => item && typeof item === 'object'
    && typeof item.id === 'string' && Number.isSafeInteger(item.ordinal) && item.ordinal > 0
    && ['PLATFORM_ARTWORK', 'RAGFLOW_DOCUMENT'].includes(item.sourceType)
    && typeof item.sourceId === 'string' && typeof item.excerpt === 'string'
    && typeof item.excerptSha256 === 'string' && item.provenance && typeof item.provenance === 'object' && !Array.isArray(item.provenance))) {
    throw new Error('来源记录格式不完整；未将正文编号当作来源。');
  }
}
