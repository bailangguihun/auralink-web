/** Public, bounded Knowledge read contracts. Runtime snapshots never live in this repository. */
export type CountItem = { name: string; value: number };
export type PaintingMetric = {
  status: "available" | "unavailable";
  reason: string | null;
  eligibleRecords: number;
  missingOrRestrictedRecords: number;
  unmatchedRecords: number;
  items: CountItem[];
  truncated: boolean;
  unit: string;
  method: string;
};
export const metricNames = ["dynasty", "category", "geography", "style", "imagery", "sentiment", "sentimentByDynasty"] as const;
export type MetricName = typeof metricNames[number];
export type PaintingStatistics = {
  schemaVersion: 1;
  population: { key: "gallery-displayable"; label: string; count: number };
  authorNames: { count: number; eligibleRecords: number };
  metrics: Record<MetricName, PaintingMetric>;
};
export type MetricSort = "value" | "name" | "chronological";
export type PaintingMetricQuery = { page: number; size: number; q: string; sort: MetricSort; revision?: string };
export type PaintingMetricPage = {
  schemaVersion: 1; metric: MetricName; items: CountItem[]; page: number; size: number;
  totalItems: number; totalPages: number; hasMore: boolean; revision: string;
};
export type PoetryNode = { id: string; name: string; category: string; size: number; description: string };
export type PoetryLink = { source: string; target: string; value: number; label: string; summary: string; detail: string };
export type PoetryGraph = {
  schemaVersion: 1;
  source: "legacy-poetry-snapshot";
  graphSha256: string;
  statsSha256: string;
  nodeCount: number;
  edgeCount: number;
  nodes: PoetryNode[];
  links: PoetryLink[];
  entityTypes: CountItem[];
  relationTypes: CountItem[];
  sourceLimits: string[];
};

export class KnowledgeContractError extends Error {
  constructor() { super("知识库响应格式不完整，请重试或联系维护者核对前后端版本。"); }
}
function invalid(): never { throw new KnowledgeContractError(); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string { return typeof value === "string" ? value : invalid(); }
function number(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : invalid(); }
function count(value: unknown): number { const result = number(value); return Number.isSafeInteger(result) && result >= 0 ? result : invalid(); }
function array(value: unknown, limit: number): unknown[] { return Array.isArray(value) && value.length <= limit ? value : invalid(); }
function items(value: unknown, limit: number, signed = false): CountItem[] {
  return array(value, limit).map((entry) => {
    const item = record(entry);
    return { name: text(item.name), value: signed ? number(item.value) : count(item.value) };
  });
}
function metric(value: unknown, population: number, signed: boolean): PaintingMetric {
  const item = record(value);
  if (item.status !== "available" && item.status !== "unavailable") return invalid();
  const eligible = count(item.eligibleRecords);
  const missing = count(item.missingOrRestrictedRecords);
  const unmatched = count(item.unmatchedRecords);
  if (eligible + missing !== population || unmatched > eligible || typeof item.truncated !== "boolean") return invalid();
  return {
    status: item.status, reason: item.reason === null || item.reason === undefined ? null : text(item.reason),
    eligibleRecords: eligible, missingOrRestrictedRecords: missing, unmatchedRecords: unmatched,
    items: items(item.items, 100, signed), truncated: item.truncated, unit: text(item.unit), method: text(item.method),
  };
}
export function parsePaintingStatistics(value: unknown): PaintingStatistics {
  const input = record(value);
  const population = record(input.population);
  const author = record(input.authorNames);
  if (input.schemaVersion !== 1 || population.key !== "gallery-displayable") return invalid();
  const total = count(population.count);
  const authorCount = count(author.count);
  const eligibleRecords = count(author.eligibleRecords);
  if (authorCount > eligibleRecords || eligibleRecords > total) return invalid();
  const metrics = record(input.metrics);
  return {
    schemaVersion: 1, population: { key: "gallery-displayable", label: text(population.label), count: total },
    authorNames: { count: authorCount, eligibleRecords },
    metrics: Object.fromEntries(metricNames.map((name) => [name, metric(metrics[name], total, name === "sentimentByDynasty")])) as Record<MetricName, PaintingMetric>,
  };
}
/** Individual pages stay bounded even when the complete metric has thousands of groups. */
export function parsePaintingMetricPage(value: unknown, expectedMetric: MetricName): PaintingMetricPage {
  const input = record(value);
  if (input.schemaVersion !== 1 || input.metric !== expectedMetric) return invalid();
  const page = count(input.page), size = count(input.size), totalItems = count(input.totalItems);
  const totalPages = count(input.totalPages), revision = text(input.revision);
  if (size < 1 || size > 200 || revision.length === 0 || revision.length > 200
    || totalPages !== Math.ceil(totalItems / size) || typeof input.hasMore !== "boolean") return invalid();
  const values = items(input.items, size, expectedMetric === "sentimentByDynasty");
  const expectedLength = Math.max(0, Math.min(size, totalItems - page * size));
  if (values.length !== expectedLength || new Set(values.map(item => item.name)).size !== values.length
    || input.hasMore !== (page + 1 < totalPages)) return invalid();
  return { schemaVersion: 1, metric: expectedMetric, items: values, page, size, totalItems, totalPages, hasMore: input.hasMore, revision };
}

export function parsePoetryGraph(value: unknown): PoetryGraph {
  const input = record(value);
  if (input.schemaVersion !== 1 || input.source !== "legacy-poetry-snapshot") return invalid();
  const nodes = array(input.nodes, 2000).map((entry) => {
    const node = record(entry);
    return { id: text(node.id), name: text(node.name), category: text(node.category), size: number(node.size), description: text(node.description) };
  });
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length || ids.has("")) return invalid();
  const links = array(input.links, 10000).map((entry) => {
    const link = record(entry);
    const source = text(link.source), target = text(link.target);
    if (!ids.has(source) || !ids.has(target)) return invalid();
    return { source, target, value: number(link.value), label: text(link.label), summary: text(link.summary), detail: text(link.detail) };
  });
  if (count(input.nodeCount) !== nodes.length || count(input.edgeCount) !== links.length) return invalid();
  const graphSha256 = text(input.graphSha256), statsSha256 = text(input.statsSha256);
  if (![graphSha256, statsSha256].every((hash) => /^[a-f0-9]{64}$/.test(hash))) return invalid();
  const entityTypes = items(input.entityTypes, 2000);
  const entityCounts = new Map<string, number>();
  for (const node of nodes) entityCounts.set(node.category, (entityCounts.get(node.category) || 0) + 1);
  if (entityTypes.length !== entityCounts.size || new Set(entityTypes.map((item) => item.name)).size !== entityTypes.length
    || entityTypes.some((item) => entityCounts.get(item.name) !== item.value)) return invalid();
  const relationTypes = items(input.relationTypes, 10000);
  const relationCounts = new Map<string, number>();
  for (const link of links) {
    const first = link.label === "" ? "其他" : link.label.split(",")[0];
    relationCounts.set(first, (relationCounts.get(first) || 0) + 1);
  }
  if (relationTypes.length !== relationCounts.size || new Set(relationTypes.map((item) => item.name)).size !== relationTypes.length
    || relationTypes.some((item) => relationCounts.get(item.name) !== item.value)) return invalid();
  return {
    schemaVersion: 1, source: "legacy-poetry-snapshot", graphSha256, statsSha256,
    nodeCount: nodes.length, edgeCount: links.length, nodes, links,
    entityTypes, relationTypes,
    sourceLimits: array(input.sourceLimits, 30).map(text),
  };
}
export function filterNodes(nodes: PoetryNode[], query: string, category: string): PoetryNode[] {
  const search = query.trim().toLocaleLowerCase();
  return nodes.filter((node) => (!category || node.category === category) && (!search || `${node.name}\n${node.category}`.toLocaleLowerCase().includes(search)));
}
export function neighborIds(links: PoetryLink[], selectedId: string): Set<string> {
  const ids = new Set([selectedId]);
  for (const link of links) {
    if (link.source === selectedId) ids.add(link.target);
    if (link.target === selectedId) ids.add(link.source);
  }
  return ids;
}
export function graphPage(nodes: PoetryNode[], requestedPage: number, size = 20) {
  const pageCount = Math.max(1, Math.ceil(nodes.length / size));
  const page = Math.max(0, Math.min(requestedPage, pageCount - 1));
  return { page, pageCount, items: nodes.slice(page * size, (page + 1) * size) };
}

const dynastyOrder = ["先秦", "秦", "汉", "西汉", "东汉", "三国", "魏晋", "西晋", "东晋", "南北朝", "隋", "唐", "五代", "五代十国", "宋", "北宋", "南宋", "辽", "金", "元", "明", "清", "民国", "近现代", "现代", "当代"];
/** Presentation ordering only: unfamiliar source values remain separate and unchanged. */
export function chronologicalItems(items: CountItem[]): CountItem[] {
  const position = (name: string) => {
    const directIndex = dynastyOrder.indexOf(name);
    const index = directIndex >= 0 ? directIndex : dynastyOrder.indexOf(name.replace(/朝$|代$/g, ""));
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...items].sort((left, right) => position(left.name) - position(right.name));
}

/** Preserve the full denominator of a Top-K donut while leaving source labels untouched. */
export function topGroups(items: CountItem[], topK: number): CountItem[] {
  if (topK <= 0 || items.length <= topK) return items;
  return [...items.slice(0, topK), { name: `其余关系标签（${items.length - topK} 项）`, value: items.slice(topK).reduce((sum, item) => sum + item.value, 0) }];
}
