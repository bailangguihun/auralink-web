"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChartSkeleton, LoadingSection } from "@/components/loading";
import { StatePanel } from "@/components/state-panel";
import { ContentReveal } from "@/components/content-reveal";
import { useSession } from "@/components/session-provider";
import { api } from "@/lib/api";
import { chronologicalItems, type CountItem, type MetricName, type MetricSort } from "@/lib/knowledge-contracts";
import { KnowledgeMetricReader, type MetricReadState } from "@/lib/knowledge-metric-reader";

const MetricChart = dynamic(() => import("@/components/knowledge-charts").then(module => module.MetricChart), {
  ssr: false, loading: () => <ChartSkeleton compact />,
});
const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
type Display = "bars" | "points" | "tokens" | "pie" | "bar-chart";
type PageProps = { title: string; page: number; pages: number; total: number; onPage: (page: number) => void };

function PageControls({ title, page, pages, total, onPage }: PageProps) {
  const visiblePages = pages <= 200 ? Array.from({ length: pages }, (_, index) => index)
    : [...new Set([0, ...Array.from({ length: 9 }, (_, offset) => Math.max(0, Math.min(pages - 1, page + offset - 4))), pages - 1])].sort((a, b) => a - b);
  return <div className="knowledge-browser-counts">
    <output aria-label={`${title}项目数量`}>共 {number.format(total)} 项</output>
    {pages > 1 ? <nav className="knowledge-browser-pagination" aria-label={`${title}分页`}>
      <button className="button" type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>上一页</button>
      <select aria-label={`${title}页码`} value={page} onChange={event => onPage(Number(event.target.value))}>
        {visiblePages.map(index => <option key={index} value={index}>{index + 1} / {pages}</option>)}
      </select>
      <button className="button" type="button" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>下一页</button>
    </nav> : null}
  </div>;
}

function SearchControls({ title, query, sort, chronological, onQuery, onSort }: {
  title: string; query: string; sort: MetricSort; chronological: boolean;
  onQuery: (query: string) => void; onSort: (sort: MetricSort) => void;
}) {
  const [draft, setDraft] = useState(query);
  return <form role="search" aria-label={`搜索${title}`} className="knowledge-browser-search" onSubmit={event => { event.preventDefault(); onQuery(draft.trim()); }}>
    <input type="search" value={draft} maxLength={200} aria-label={`搜索${title}`} placeholder={`搜索${title}`} onChange={event => { setDraft(event.target.value); if (!event.target.value) onQuery(""); }} />
    <button className="button" type="submit">搜索</button>
    <select aria-label={`${title}排序`} value={sort} onChange={event => onSort(event.target.value as MetricSort)}>
      {chronological ? <option value="chronological">时代顺序</option> : null}
      <option value="value">数值从高到低</option><option value="name">名称顺序</option>
    </select>
  </form>;
}

function MetricValues({ title, items, unit, display }: { title: string; items: CountItem[]; unit: string; display: Display }) {
  if (!items.length) return <StatePanel compact kind="empty" title="暂无匹配项目" />;
  if (display === "pie" || display === "bar-chart") return <MetricChart compact kind={display === "pie" ? "pie" : "bar"} items={items} unit={unit} label={title} />;
  const max = display === "points" ? 100 : Math.max(1, ...items.map(item => item.value));
  return <div className={`knowledge-browser-scroll${display === "tokens" ? " knowledge-browser-tokens" : ""}`} tabIndex={0} role="region" aria-label={`${title}全部项目`}>
    <ul className={display === "tokens" ? "knowledge-token-list" : "knowledge-value-list"}>
      {items.map(item => <li key={item.name} data-knowledge-item>
        <span className="knowledge-item-name">{item.name}</span>
        {display !== "tokens" ? <span className={`knowledge-value-track${display === "points" ? " is-point" : ""}`} aria-hidden="true"><span style={display === "points" ? { left: `${Math.max(0, Math.min(100, item.value))}%` } : { width: `${Math.max(.3, item.value / max * 100)}%` }} /></span> : null}
        <span className="knowledge-item-value" aria-label={`${number.format(item.value)} ${unit}`}>{number.format(item.value)}</span>
      </li>)}
    </ul>
  </div>;
}

export function RemoteMetricBrowser(props: { metric: MetricName; title: string; unit: string; display?: Display; searchable?: boolean }) {
  const { sessionIdentity } = useSession();
  return <RemoteMetricContent key={`${props.metric}:${sessionIdentity.generation}`} {...props} />;
}

function RemoteMetricContent({ metric, title, unit, display = "bars", searchable = true }: {
  metric: MetricName; title: string; unit: string; display?: Display; searchable?: boolean;
}) {
  const { token, sessionIdentity, isCurrentSession, signOutIfCurrent } = useSession();
  const chronological = metric === "dynasty" || metric === "sentimentByDynasty";
  const [query, setQuery] = useState({ q: "", sort: chronological ? "chronological" as MetricSort : "value" as MetricSort, page: 0 });
  const [attempt, setAttempt] = useState(0);
  const revision = useRef<string | undefined>(undefined);
  const resolvedQuery = useRef<string | null>(null);
  const [state, setState] = useState<MetricReadState & { key: string }>({ key: "", data: null, loading: true, error: null });
  const displayKey = JSON.stringify([query, attempt]);
  const busy = state.key !== displayKey || state.loading;
  const size = metric === "style" || metric === "imagery" ? 100 : 200;
  useEffect(() => {
    if (!token) return;
    // A revision reset can return page zero for a request to an older page.
    // Reconcile the controlled pager without fetching the already received page again.
    const requestKey = JSON.stringify([query, attempt]);
    if (resolvedQuery.current === requestKey) return;
    resolvedQuery.current = null;
    const identity = sessionIdentity;
    const reader = new KnowledgeMetricReader(
      (params, signal) => api.paintingMetric(metric, params, token, signal),
      () => isCurrentSession(identity),
      next => {
        let responseKey = requestKey;
        if (next.data) {
          revision.current = next.data.revision;
          const resolved = { ...query, page: next.data.page };
          resolvedQuery.current = JSON.stringify([resolved, attempt]);
          responseKey = resolvedQuery.current;
          if (resolved.page !== query.page) setQuery(resolved);
        }
        setState({ ...next, key: responseKey });
      },
      () => { signOutIfCurrent(identity); },
    );
    void reader.read({ ...query, size, revision: revision.current });
    return () => reader.dispose();
  }, [attempt, isCurrentSession, metric, query, sessionIdentity, signOutIfCurrent, size, token]);
  const search = (q: string) => { revision.current = undefined; resolvedQuery.current = null; setQuery(old => ({ ...old, q, page: 0 })); };
  const sort = (value: MetricSort) => { revision.current = undefined; resolvedQuery.current = null; setQuery(old => ({ ...old, sort: value, page: 0 })); };
  const retry = () => { revision.current = undefined; setAttempt(value => value + 1); };
  return <div className="knowledge-metric-browser" aria-busy={busy || undefined}>
    {searchable ? <SearchControls title={title} query={query.q} sort={query.sort} chronological={chronological} onQuery={search} onSort={sort} /> : null}
    <ContentReveal entryKey={displayKey} ready={!busy} label={title}>
    {!busy && state.error ? <StatePanel compact kind="error" title="统计读取失败" description={state.error} actionLabel="重新加载" onAction={retry} />
      : busy || !state.data ? <LoadingSection label={`正在读取${title}`} onRetry={retry}><ChartSkeleton compact /></LoadingSection>
      : <><PageControls title={title} page={state.data.page} pages={state.data.totalPages} total={state.data.totalItems} onPage={page => setQuery(old => ({ ...old, page }))} />
        <MetricValues title={title} items={state.data.items} unit={unit} display={display} />
      </>}
    </ContentReveal>
  </div>;
}

export function LocalMetricBrowser({ title, items, unit }: { title: string; items: CountItem[]; unit: string }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MetricSort>("value");
  const [page, setPage] = useState(0);
  const size = 100;
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const found = items.filter(item => !search || item.name.toLocaleLowerCase().includes(search));
    return sort === "chronological" ? chronologicalItems(found) : found.sort((a, b) => (sort === "value" ? b.value - a.value : 0) || a.name.localeCompare(b.name, "zh-CN"));
  }, [items, query, sort]);
  const pages = Math.ceil(filtered.length / size);
  const currentPage = Math.max(0, Math.min(page, pages - 1));
  return <div className="knowledge-metric-browser">
    <SearchControls title={title} query={query} sort={sort} chronological={false} onQuery={value => { setQuery(value); setPage(0); }} onSort={value => { setSort(value); setPage(0); }} />
    <ContentReveal entryKey={JSON.stringify([query, sort, currentPage])} label={title}>
      <PageControls title={title} page={currentPage} pages={pages} total={filtered.length} onPage={setPage} />
      <MetricValues title={title} items={filtered.slice(currentPage * size, (currentPage + 1) * size)} unit={unit} display="bars" />
    </ContentReveal>
  </div>;
}
