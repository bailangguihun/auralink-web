"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ModuleHeader } from "@/components/module-header";
import { ChartSkeleton, KnowledgeSkeleton, LoadingSection, LoadingStatus } from "@/components/loading";
import { StatePanel } from "@/components/state-panel";
import { useKnowledgeResource } from "@/components/knowledge-resource";
import { api } from "@/lib/api";
import { KNOWLEDGE_STATISTICS_KEY, KNOWLEDGE_GRAPH_KEY } from "@/lib/navigation-data";
import { chartTruncatesItems } from "@/lib/knowledge-presentation";
import { chronologicalItems, filterNodes, graphPage, neighborIds, topGroups, type CountItem, type PaintingMetric, type PoetryGraph, type PoetryLink } from "@/lib/knowledge-contracts";

const chartLoading = () => <LoadingSection label="正在准备图表"><ChartSkeleton compact /></LoadingSection>;
const MetricChart = dynamic(() => import("@/components/knowledge-charts").then((module) => module.MetricChart), { ssr: false, loading: chartLoading });
const PoetryChart = dynamic(() => import("@/components/knowledge-charts").then((module) => module.PoetryChart), { ssr: false, loading: chartLoading });
const format = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

function ResourceFailure({ error, unavailable, retry, subject }: { error: string; unavailable: boolean; retry: () => void; subject: string }) {
  return <StatePanel kind={unavailable ? "unavailable" : "error"} title={`${subject}${unavailable ? "暂不可用" : "加载失败"}`} description={`${error}${unavailable ? " 该功能需要配套的知识库服务及数据，请在服务就绪后重试。" : ""}`} actionLabel="重新加载" onAction={retry} />;
}

function ItemTable({ items, unit, summary, label }: { items: CountItem[]; unit: string; summary?: string; label?: string }) {
  return <details className="knowledge-data"><summary>{summary || `查看数值 · ${items.length} 项`}</summary><div className="knowledge-table-scroll"><table aria-label={label}><thead><tr><th scope="col">项目</th><th scope="col">{unit}</th></tr></thead><tbody>{items.map((item, index) => <tr key={`${item.name}-${index}`}><th scope="row">{item.name}</th><td>{format.format(item.value)}</td></tr>)}</tbody></table></div></details>;
}

function MetricPanel({ title, metric, children, description, ruleBased = false, wide = false, chartLimit }: {
  title: string; metric: PaintingMetric; children?: React.ReactNode; description?: string;
  ruleBased?: boolean; wide?: boolean; chartLimit?: number;
}) {
  const chartLimited = chartTruncatesItems(metric.items.length, chartLimit);
  return <section className={`knowledge-panel knowledge-metric-panel glass-panel${wide ? " knowledge-panel-wide" : ""}`}>
    <header className="knowledge-panel-heading">
      <div className="knowledge-metric-title"><h2>{title}</h2>{ruleBased ? <span className="knowledge-rule-badge">规则估计</span> : null}</div>
      <p className="knowledge-sample">有效样本 {format.format(metric.eligibleRecords)} 幅</p>
    </header>
    {metric.status === "unavailable" ? <StatePanel compact kind="unavailable" title="暂无可用统计" description={metric.reason || "当前公开字段未提供此项统计所需的数据。"} />
      : metric.items.length ? children : <StatePanel compact kind="empty" title="暂无匹配项目" description={metric.reason || "存在可用字段，但没有匹配到当前统计规则的项目。"} />}
    <div className="knowledge-metric-controls">
      {chartLimited ? <span className="knowledge-limit-note">图中前 {chartLimit} 项</span> : null}
      <details className="knowledge-metric-details knowledge-data">
        <summary>说明</summary>
        {description ? <p className="knowledge-method">{description}</p> : null}
        <p className="knowledge-method">{metric.method}</p>
        <div className="knowledge-coverage"><span>缺失或未公开 {format.format(metric.missingOrRestrictedRecords)} 幅</span>{metric.unmatchedRecords > 0 ? <span>未匹配 {format.format(metric.unmatchedRecords)} 幅</span> : null}</div>
        {chartLimited ? <p className="knowledge-method">图中显示当前排序的前 {chartLimit} 项，数据表列出接口返回的全部 {metric.items.length} 项。</p> : null}
        {metric.truncated ? <p className="knowledge-method">接口按本指标的排序只返回部分项目，未列出的项目不在图中或数据表内；样本数仍按全部有效画作计。</p> : null}
      </details>
      {metric.status === "available" && metric.items.length ? <ItemTable items={metric.items} unit={metric.unit} summary="数据表" label={`${title}数据`} /> : null}
    </div>
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
      <section className="knowledge-count glass-panel"><span>作品数</span><strong>{format.format(population.count)}</strong></section>
      <section className="knowledge-count glass-panel"><span>作者名称数</span><strong>{format.format(authorNames.count)}</strong></section>
    </div>
    <details className="knowledge-rules"><summary>统计说明</summary><p>{population.label}。作品数与画廊使用同一当前修订、发布状态与媒体资格规则；只对允许公开的字段进行聚合。</p><p>作者名称数按规范化后的公开名称去重，不是已核验人数；同名异人和一人多名尚未消歧。{format.format(authorNames.eligibleRecords)} 幅作品提供有效公开名称。</p><p>空白、未知值与字面量「0」（待核实）不当作有效分类或作者。各图有效样本数均按画作计，字段缺失与未公开合并显示，不推断隐藏内容。多值标签按规则拆分，同一作品可能贡献多个项目。</p></details>
    {population.count === 0 ? <StatePanel kind="empty" title="暂无可浏览画作" description="当前画廊没有符合展示条件的作品，因此没有可统计样本。" /> : <div className="knowledge-grid knowledge-painting-grid">
      <MetricPanel title="作者地域分布" metric={metrics.geography} chartLimit={12} description="不同出生地描述保留为不同组合；有效样本数按同时提供公开名称和出生地的画作计，出生地不代表创作地点。">
        <MetricChart compact kind="bar" items={metrics.geography.items.slice(0, 12)} unit={metrics.geography.unit} label="作者名称与出生地去重组合的地域分布，完整返回数值见数据表" />
      </MetricPanel>
      <MetricPanel title="朝代分布" metric={metrics.dynasty} chartLimit={12} description="图中按时代顺序展示；未识别时代保留原值并列于末尾。"><MetricChart compact kind="bar" items={chronologicalItems(metrics.dynasty.items).slice(0, 12)} unit={metrics.dynasty.unit} label="朝代作品数量，完整返回数值见数据表" /></MetricPanel>
      <MetricPanel title="作品分类" metric={metrics.category} chartLimit={12}><MetricChart compact kind="bar" items={metrics.category.items.slice(0, 12)} unit={metrics.category.unit} label="作品分类数量，完整返回数值见数据表" /></MetricPanel>
      <MetricPanel title="绘画风格" metric={metrics.style}><MetricChart compact kind="pie" items={metrics.style.items} unit={metrics.style.unit} label="绘画风格分布，完整返回数值见数据表" /></MetricPanel>
      <MetricPanel title="画中意象" metric={metrics.imagery} wide description="词语大小表示被统计到的频次。">
        <div className="knowledge-wordcloud" aria-label="意象词云">{metrics.imagery.items.map((item, index) => <span key={`${item.name}-${index}`} style={{ fontSize: `${0.85 + 1.7 * Math.sqrt(item.value / Math.max(1, ...metrics.imagery.items.map((entry) => entry.value)))}rem` }} title={`${item.name}：${item.value} ${metrics.imagery.unit}`}>{item.name}</span>)}</div>
      </MetricPanel>
      <MetricPanel title="配乐情感" metric={metrics.sentiment} ruleBased><MetricChart compact kind="pie" items={metrics.sentiment.items} unit={metrics.sentiment.unit} label="配乐情感关键词规则统计，非模型分析" /></MetricPanel>
      <MetricPanel title="朝代情感" metric={metrics.sentimentByDynasty} ruleBased description="各朝代有效样本的规则均值；连线不代表历史趋势或因果关系，未识别时代保留原值并列于末尾。"><MetricChart compact kind="line" items={chronologicalItems(metrics.sentimentByDynasty.items)} unit={metrics.sentimentByDynasty.unit} label="各朝代文本关键词规则估计均值，非客观情绪分数" /></MetricPanel>
    </div>}
  </div>;
}

function PoetryExplorer({ graph }: { graph: PoetryGraph }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [topK, setTopK] = useState(10);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<PoetryLink | null>(null);
  const [focused, setFocused] = useState(false);
  const categories = useMemo(() => [...new Set(graph.nodes.map((node) => node.category))].sort(), [graph.nodes]);
  const filtered = useMemo(() => filterNodes(graph.nodes, query, category), [category, graph.nodes, query]);
  const paging = graphPage(filtered, page);
  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const selected = selectedId ? byId.get(selectedId) : null;
  const connected = useMemo(() => selectedId ? neighborIds(graph.links, selectedId) : null, [graph.links, selectedId]);
  const shownNodes = useMemo(() => focused && connected ? graph.nodes.filter((node) => connected.has(node.id)) : filtered, [connected, filtered, focused, graph.nodes]);
  const shownLinks = useMemo(() => { const ids = new Set(shownNodes.map((node) => node.id)); return graph.links.filter((link) => ids.has(link.source) && ids.has(link.target)); }, [graph.links, shownNodes]);
  const selectedLinks = useMemo(() => graph.links.filter((link) => link.source === selectedId || link.target === selectedId), [graph.links, selectedId]);
  const clearSelection = () => { setSelectedId(null); setSelectedEdge(null); setFocused(false); };
  const selectNode = (id: string) => { setSelectedId(id); setSelectedEdge(null); };
  return <div id="knowledge-poetry" role="tabpanel" aria-labelledby="knowledge-tab-poetry">
    <div className="knowledge-snapshot glass-panel"><div><span className="knowledge-eyebrow">诗词关系图谱 / SNAPSHOT</span><h2>循着一条关系，读懂一重诗意</h2><p>既有诗词图谱快照 · {format.format(graph.nodeCount)} 个实体 · {format.format(graph.edgeCount)} 条关系</p></div><span className="knowledge-seal" aria-hidden="true">诗<br />脉</span></div>
    <details className="knowledge-rules"><summary>图谱来源与使用边界</summary><p>此处展示既有 JSON 图谱快照，并非 PostgreSQL 图谱。不自动包含新增国画记录。原 GraphML 尚未找回，上游提取准确性未经核验，节点与关系按原快照展示。</p>{graph.sourceLimits.map((limit, index) => <p key={index}>{limit}</p>)}<p className="knowledge-hash">图谱 SHA-256：{graph.graphSha256}<br />统计 SHA-256：{graph.statsSha256}</p></details>
    {graph.nodeCount === 0 ? <StatePanel kind="empty" title="图谱快照为空" description="当前配置的快照未包含实体或关系。" /> : <>
      <div className="knowledge-search glass-panel">
        <label><span>搜索实体</span><input type="search" value={query} maxLength={200} placeholder="输入名称或类别，如：李白、诗人" onChange={(event) => { setQuery(event.target.value); setPage(0); clearSelection(); }} /></label>
        <label><span>实体类别</span><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(0); clearSelection(); }}><option value="">全部类别</option>{categories.map((item) => <option value={item} key={item}>{item || "未分类"}</option>)}</select></label>
        <button className="button" onClick={() => { setQuery(""); setCategory(""); setPage(0); clearSelection(); }}>重置筛选</button>
      </div>
      <section className="knowledge-graph-panel glass-panel" aria-label="诗词图谱浏览器">
        <header className="knowledge-graph-toolbar"><div><h2>{focused && selected ? `${selected.name} · 一跳邻域` : "诗词关系"}</h2><p>{shownNodes.length} 个实体 · {shownLinks.length} 条关系 · 拖动平移，滚轮缩放</p></div><div className="knowledge-graph-actions"><button className="button" disabled={!selectedId} onClick={() => setFocused((value) => !value)}>{focused ? "返回筛选视图" : "聚焦一跳邻域"}</button><button className="button" disabled={!selectedId && !selectedEdge} onClick={clearSelection}>清除选择</button></div></header>
        {filtered.length === 0 ? <StatePanel kind="empty" title="没有匹配的实体" description="试试其他名称或类别，也可以重置筛选。" /> : <PoetryChart nodes={shownNodes} links={shownLinks} selectedId={selectedId} focused={focused} onNode={selectNode} onEdge={setSelectedEdge} />}
        <div className="knowledge-inspector" aria-live="polite">
          {selectedEdge ? <><span className="knowledge-eyebrow">关系详情</span><h3>{byId.get(selectedEdge.source)?.name || selectedEdge.source} — {byId.get(selectedEdge.target)?.name || selectedEdge.target}</h3><p><b>{selectedEdge.label || "未命名关系"}</b> · 权重 {selectedEdge.value}</p><p>{selectedEdge.detail || selectedEdge.summary || "快照未提供关系描述。"}</p></>
            : selected ? <><span className="knowledge-eyebrow">{selected.category || "未分类"} · {Math.max(0, (connected?.size || 1) - 1)} 个邻接实体</span><h3>{selected.name}</h3><p>{selected.description || "快照未提供实体描述。"}</p>{selectedLinks.length ? <details><summary>查看相邻关系 · {selectedLinks.length} 条</summary><ul className="knowledge-relations">{selectedLinks.map((link, index) => <li key={index}><button className="text-button" onClick={() => setSelectedEdge(link)}>{byId.get(link.source)?.name} — {byId.get(link.target)?.name}：{link.label || "未命名关系"}</button></li>)}</ul></details> : <p>此实体没有相邻关系。</p>}</>
              : <p>点击图中实体或下方实体卡，高亮它的一跳邻居。选择关系可查看原始描述；「聚焦一跳邻域」会单独展示选中实体及其邻居。</p>}
        </div>
      </section>
      <div className="knowledge-grid knowledge-summary-grid">
        <section className="knowledge-panel glass-panel"><header className="knowledge-panel-heading"><span className="knowledge-eyebrow">快照全量 / ENTITIES</span><h2>实体类别</h2><p>以下概览不随搜索筛选变化。</p></header><MetricChart kind="pie" items={graph.entityTypes} unit="个实体" label="快照实体类型分布，数值见列表" /><ItemTable items={graph.entityTypes} unit="个实体" /></section>
        <section className="knowledge-panel glass-panel"><header className="knowledge-panel-heading"><span className="knowledge-eyebrow">快照全量 / RELATIONS</span><h2>关系标签</h2><p>按旧导出规则，每条关系统计首个英文逗号前的标签。其余项目合并展示，保留全部关系作为分母。</p><label className="knowledge-topk">展示数量 <select value={topK} onChange={(event) => setTopK(Number(event.target.value))}><option value={5}>前 5 项</option><option value={10}>前 10 项</option><option value={15}>前 15 项</option><option value={20}>前 20 项</option><option value={0}>全部</option></select></label></header>{graph.relationTypes.length ? <><MetricChart kind="pie" items={topGroups(graph.relationTypes, topK)} unit="条关系" label="快照关系首标签统计，数值见列表" /><ItemTable items={graph.relationTypes} unit="条关系" /></> : <StatePanel compact kind="empty" title="暂无关系标签" />}</section>
      </div>
      <section className="knowledge-entities" aria-labelledby="knowledge-entities-title"><header className="knowledge-entity-heading"><h2 id="knowledge-entities-title">实体索引</h2><span aria-live="polite">{filtered.length} 个搜索结果</span></header>
        {filtered.length ? <div className="knowledge-entity-grid">{paging.items.map((node) => <button key={node.id} className={`knowledge-entity glass-panel${selectedId === node.id ? " is-selected" : ""}`} onClick={() => { selectNode(node.id); setFocused(true); document.querySelector(".knowledge-graph-panel")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); }} aria-pressed={selectedId === node.id}><span>{node.category || "未分类"}</span><h3>{node.name}</h3><p>{node.description || "暂无实体描述"}</p><b>查看邻域 ↗</b></button>)}</div> : <p className="knowledge-method">没有匹配的实体卡。</p>}
        {filtered.length ? <nav className="pagination" aria-label="实体分页"><button className="button" disabled={paging.page === 0} onClick={() => setPage(paging.page - 1)}>上一页</button><span>第 {paging.page + 1} / {paging.pageCount} 页</span><button className="button" disabled={paging.page + 1 >= paging.pageCount} onClick={() => setPage(paging.page + 1)}>下一页</button></nav> : null}
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
    <div hidden={view !== "paintings"}><PaintingView /></div>
    {poetryVisited ? <div hidden={view !== "poetry"}><PoetryView /></div> : null}
  </main>;
}
