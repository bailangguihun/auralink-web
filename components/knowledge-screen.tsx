"use client";
import { ContentReveal } from "@/components/content-reveal";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ModuleHeader } from "@/components/module-header";
import { ChartSkeleton, KnowledgeSkeleton, LoadingSection, LoadingStatus } from "@/components/loading";
import { StatePanel } from "@/components/state-panel";
import { useKnowledgeResource } from "@/components/knowledge-resource";
import { api } from "@/lib/api";
import { KNOWLEDGE_STATISTICS_KEY, KNOWLEDGE_GRAPH_KEY } from "@/lib/navigation-data";
import { LocalMetricBrowser, RemoteMetricBrowser } from "@/components/knowledge-metric-browser";
import { poetrySnapshotCounts } from "@/lib/knowledge-presentation";
import { graphPage, neighborIds, type MetricName, type PaintingMetric, type PoetryGraph, type PoetryLink } from "@/lib/knowledge-contracts";

const chartLoading = () => <LoadingSection label="正在准备图表"><ChartSkeleton compact /></LoadingSection>;
const MetricChart = dynamic(() => import("@/components/knowledge-charts").then((module) => module.MetricChart), { ssr: false, loading: chartLoading });
const PoetryChart = dynamic(() => import("@/components/knowledge-charts").then((module) => module.PoetryChart), { ssr: false, loading: chartLoading });
const format = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

function ResourceFailure({ error, unavailable, retry, subject }: { error: string; unavailable: boolean; retry: () => void; subject: string }) {
  return <StatePanel kind={unavailable ? "unavailable" : "error"} title={`${subject}${unavailable ? "暂不可用" : "加载失败"}`} description={`${error}${unavailable ? " 该功能需要配套的知识库服务及数据，请在服务就绪后重试。" : ""}`} actionLabel="重新加载" onAction={retry} />;
}

function MetricPanel({ name, title, metric, children, ruleBased = false, wide = false }: {
  name: MetricName; title: string; metric: PaintingMetric; children?: React.ReactNode;
  ruleBased?: boolean; wide?: boolean;
}) {
  return <section data-knowledge-metric={name} className={`knowledge-panel knowledge-metric-panel glass-panel${wide ? " knowledge-panel-wide" : ""}`}>
    <header className="knowledge-panel-heading">
      <div className="knowledge-metric-title"><h2>{title}</h2>{ruleBased ? <span className="knowledge-rule-badge">规则估计</span> : null}</div>
      <p className="knowledge-sample">有效样本 {format.format(metric.eligibleRecords)} 幅</p>
    </header>
    {metric.status === "unavailable" ? <StatePanel compact kind="unavailable" title="暂无可用统计" /> : children}
  </section>;
}

function PaintingView() {
  const statistics = useKnowledgeResource(KNOWLEDGE_STATISTICS_KEY, api.paintingStatistics);
  if (statistics.loading && !statistics.data) return <LoadingSection label="正在读取画作统计" onRetry={statistics.retry}><KnowledgeSkeleton /></LoadingSection>;
  if (statistics.error) return <ResourceFailure {...statistics} error={statistics.error} subject="画作统计" />;
  if (!statistics.data) return null;
  const { population, authorNames, metrics } = statistics.data;
  return <div id="knowledge-paintings" role="tabpanel" aria-labelledby="knowledge-tab-paintings">
    {statistics.loading ? <LoadingStatus label="正在更新统计，暂保留当前已读取的数据" /> : null}
    <div className="knowledge-counts content-reveal">
      <section className="knowledge-count glass-panel"><span>国画作品数</span><strong>{format.format(population.count)}</strong></section>
      <section className="knowledge-count glass-panel"><span>作者名称数</span><strong>{format.format(authorNames.count)}</strong></section>
    </div>
    {population.count === 0 ? <StatePanel kind="empty" title="暂无可浏览画作" /> : <div className="knowledge-grid knowledge-painting-grid">
      <MetricPanel name="geography" title="作者地域分布" metric={metrics.geography}>
        <RemoteMetricBrowser metric="geography" title="作者地域分布" unit={metrics.geography.unit} />
      </MetricPanel>
      <MetricPanel name="dynasty" title="朝代分布" metric={metrics.dynasty}>
        <RemoteMetricBrowser metric="dynasty" title="朝代分布" unit={metrics.dynasty.unit} />
      </MetricPanel>
      <MetricPanel name="category" title="作品分类" metric={metrics.category}>
        <RemoteMetricBrowser metric="category" title="作品分类" unit={metrics.category.unit} display="bar-chart" searchable={false} />
      </MetricPanel>
      <MetricPanel name="sentiment" title="配乐情感" metric={metrics.sentiment} ruleBased>
        <RemoteMetricBrowser metric="sentiment" title="配乐情感" unit={metrics.sentiment.unit} display="pie" searchable={false} />
      </MetricPanel>
      <MetricPanel name="style" title="绘画风格" metric={metrics.style} wide>
        <RemoteMetricBrowser metric="style" title="绘画风格" unit={metrics.style.unit} />
      </MetricPanel>
      <MetricPanel name="imagery" title="画中意象" metric={metrics.imagery} wide>
        <RemoteMetricBrowser metric="imagery" title="画中意象" unit={metrics.imagery.unit} display="tokens" />
      </MetricPanel>
      <MetricPanel name="sentimentByDynasty" title="朝代情感" metric={metrics.sentimentByDynasty} ruleBased wide>
        <RemoteMetricBrowser metric="sentimentByDynasty" title="朝代情感" unit={metrics.sentimentByDynasty.unit} display="points" />
      </MetricPanel>
    </div>}
  </div>;
}

function PoetryExplorer({ graph }: { graph: PoetryGraph }) {
  const counts = useMemo(() => poetrySnapshotCounts(graph.nodes), [graph.nodes]);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<PoetryLink | null>(null);
  const [focused, setFocused] = useState(false);
  const paging = graphPage(graph.nodes, page);
  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const selected = selectedId ? byId.get(selectedId) : null;
  const connected = useMemo(() => selectedId ? neighborIds(graph.links, selectedId) : null, [graph.links, selectedId]);
  const shownNodes = useMemo(() => focused && connected ? graph.nodes.filter((node) => connected.has(node.id)) : graph.nodes, [connected, focused, graph.nodes]);
  const shownLinks = useMemo(() => { const ids = new Set(shownNodes.map((node) => node.id)); return graph.links.filter((link) => ids.has(link.source) && ids.has(link.target)); }, [graph.links, shownNodes]);
  const selectedLinks = useMemo(() => graph.links.filter((link) => link.source === selectedId || link.target === selectedId), [graph.links, selectedId]);
  const clearSelection = () => { setSelectedId(null); setSelectedEdge(null); setFocused(false); };
  const selectNode = (id: string) => { setSelectedId(id); setSelectedEdge(null); };
  return <div id="knowledge-poetry" role="tabpanel" aria-labelledby="knowledge-tab-poetry">
    <div className="knowledge-counts content-reveal">
      <section className="knowledge-count glass-panel" title="按现有图谱中含“诗词”的分类条目统计，非已核实的诗作总数"><span>诗词作品数</span><strong>{format.format(counts.poems)}</strong></section>
      <section className="knowledge-count glass-panel" title="按现有图谱中含“诗人”的分类名称去重统计，非已核实的作者总数"><span>作者名称数</span><strong>{format.format(counts.authorNames)}</strong></section>
    </div>
    {graph.nodeCount === 0 ? <StatePanel kind="empty" title="图谱快照为空" description="当前配置的快照未包含实体或关系。" /> : <>
      <section className="knowledge-graph-panel glass-panel" aria-label="诗词图谱浏览器">
        <header className="knowledge-graph-toolbar"><div><h2>{focused && selected ? `${selected.name} · 一跳邻域` : "诗词关系"}</h2><p>{shownNodes.length} 个实体 · {shownLinks.length} 条关系</p></div><div className="knowledge-graph-actions"><button className="button" disabled={!selectedId} onClick={() => setFocused((value) => !value)}>{focused ? "返回全图" : "聚焦一跳邻域"}</button><button className="button" disabled={!selectedId && !selectedEdge} onClick={clearSelection}>清除选择</button></div></header>
        <PoetryChart nodes={shownNodes} links={shownLinks} selectedId={selectedId} focused={focused} onNode={selectNode} onEdge={setSelectedEdge} />
        {selectedEdge || selected ? <div className="knowledge-inspector" aria-live="polite">
          {selectedEdge ? <><span className="knowledge-eyebrow">关系详情</span><h3>{byId.get(selectedEdge.source)?.name || selectedEdge.source} — {byId.get(selectedEdge.target)?.name || selectedEdge.target}</h3><p><b>{selectedEdge.label || "未命名关系"}</b> · 权重 {selectedEdge.value}</p><p>{selectedEdge.detail || selectedEdge.summary || "快照未提供关系描述。"}</p></>
            : selected ? <><span className="knowledge-eyebrow">{selected.category || "未分类"} · {Math.max(0, (connected?.size || 1) - 1)} 个邻接实体</span><h3>{selected.name}</h3><p>{selected.description || "快照未提供实体描述。"}</p>{selectedLinks.length ? <details><summary>查看相邻关系 · {selectedLinks.length} 条</summary><ul className="knowledge-relations">{selectedLinks.map((link, index) => <li key={index}><button className="text-button" onClick={() => setSelectedEdge(link)}>{byId.get(link.source)?.name} — {byId.get(link.target)?.name}：{link.label || "未命名关系"}</button></li>)}</ul></details> : <p>此实体没有相邻关系。</p>}</>
              : null}
        </div> : null}
      </section>
      <div className="knowledge-grid knowledge-summary-grid">
        <section data-knowledge-metric="entityTypes" className="knowledge-panel knowledge-entity-summary glass-panel"><header className="knowledge-panel-heading"><h2>实体类别</h2></header><MetricChart compact kind="pie" items={graph.entityTypes} unit="个实体" label="实体类别" /></section>
        <section data-knowledge-metric="relations" className="knowledge-panel glass-panel"><header className="knowledge-panel-heading"><h2>关系标签</h2></header><LocalMetricBrowser title="关系标签" items={graph.relationTypes} unit="条关系" /></section>
      </div>
      <section className="knowledge-entities" aria-labelledby="knowledge-entities-title"><header className="knowledge-entity-heading"><h2 id="knowledge-entities-title">实体索引</h2><span aria-live="polite">{graph.nodes.length} 个实体</span></header>
        <div className="knowledge-entity-grid">{paging.items.map((node) => <button key={node.id} className={`knowledge-entity glass-panel${selectedId === node.id ? " is-selected" : ""}`} onClick={() => { selectNode(node.id); setFocused(true); document.querySelector(".knowledge-graph-panel")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); }} aria-pressed={selectedId === node.id}><span>{node.category || "未分类"}</span><h3>{node.name}</h3><p>{node.description || "暂无实体描述"}</p><b>查看邻域 ↗</b></button>)}</div>
        <nav className="pagination" aria-label="实体分页"><button className="button" disabled={paging.page === 0} onClick={() => setPage(paging.page - 1)}>上一页</button><span>第 {paging.page + 1} / {paging.pageCount} 页</span><button className="button" disabled={paging.page + 1 >= paging.pageCount} onClick={() => setPage(paging.page + 1)}>下一页</button></nav>
      </section>
    </>}
  </div>;
}

function PoetryView() {
  const resource = useKnowledgeResource(KNOWLEDGE_GRAPH_KEY, api.poetryGraph);
  if (resource.loading && !resource.data) return <LoadingSection label="正在读取诗词图谱" onRetry={resource.retry}><KnowledgeSkeleton graph /></LoadingSection>;
  if (resource.error) return <ResourceFailure {...resource} error={resource.error} subject="诗词图谱" />;
  return resource.data ? <PoetryExplorer graph={resource.data} /> : null;
}

export function KnowledgeScreen() {
  const [view, setView] = useState<"paintings" | "poetry">("paintings");
  const [poetryVisited, setPoetryVisited] = useState(false);
  const selectView = (next: "paintings" | "poetry") => { setView(next); if (next === "poetry") setPoetryVisited(true); };
  return <main className="page-shell module-page knowledge-page">
    <ModuleHeader module="knowledge" />
    <div className="knowledge-tabs" role="tablist" aria-label="知识库视图">{([['paintings', '国画统计'], ['poetry', '诗词图谱']] as const).map(([key, title]) => <button type="button" key={key} id={`knowledge-tab-${key}`} role="tab" aria-selected={view === key} aria-controls={`knowledge-${key}`} tabIndex={view === key ? 0 : -1} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "paintings" : event.key === "End" ? "poetry" : view === "paintings" ? "poetry" : "paintings"; selectView(next); document.getElementById(`knowledge-tab-${next}`)?.focus(); } }} onClick={() => selectView(key)}><strong>{title}</strong></button>)}</div>
    <ContentReveal entryKey={view} label="知识库模块">
      <div hidden={view !== "paintings"}><PaintingView /></div>
      {poetryVisited ? <div hidden={view !== "poetry"}><PoetryView /></div> : null}
    </ContentReveal>
  </main>;
}
