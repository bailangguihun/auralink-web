import type { Citation, Message, Run } from './assistant-contracts.ts';

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
