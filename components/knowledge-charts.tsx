"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, PieChart, LineChart, GraphChart } from "echarts/charts";
import { TooltipComponent, GridComponent, AriaComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { StatePanel } from "@/components/state-panel";
import type { CountItem, PoetryNode, PoetryLink } from "@/lib/knowledge-contracts";
import { neighborIds } from "@/lib/knowledge-contracts";
import { resizeMeasuredChart } from "@/lib/chart-resize";
import { paintingChartHeight } from "@/lib/knowledge-presentation";
import { graphViewportFit, type GraphPoint } from "@/lib/graph-viewport";

echarts.use([BarChart, PieChart, LineChart, GraphChart, TooltipComponent, GridComponent, AriaComponent, CanvasRenderer]);
const palette = ["#8b6b52", "#657763", "#ad875d", "#778b8c", "#986b6a", "#baa07b", "#78727e", "#9f956b"];
const textStyle = { color: "#6b5f4e", fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif' };
const base: EChartsOption = {
  color: palette, textStyle, animationDuration: 250,
  // Canvas rich text never inserts labels or descriptions into HTML.
  tooltip: { renderMode: "richText", confine: true, backgroundColor: "#fcf8f2", borderColor: "#d8cabc", textStyle },
  aria: { enabled: true },
};

type Click = { dataType?: string; data?: { id?: string; source?: string; target?: string }; dataIndex?: number };
// ECharts does not expose force-layout positions through getOption(). Keep the
// version-specific read in one guarded adapter; movement uses public actions.
function graphPixels(chart: echarts.EChartsType): GraphPoint[] {
  const model = (chart as unknown as { getModel(): { getSeriesByIndex(index: number): {
    getData(): { count(): number; getItemLayout(index: number): number[] };
  } } }).getModel().getSeriesByIndex(0);
  const data = model.getData();
  const points: GraphPoint[] = [];
  for (let index = 0; index < data.count(); index++) {
    const point = chart.convertToPixel({ seriesIndex: 0 }, data.getItemLayout(index));
    if (Array.isArray(point) && point.length >= 2) points.push([point[0], point[1]]);
  }
  return points;
}

function CanvasChart({ option, label, onClick, className = "", height, graphKey }: { option: EChartsOption; label: string; onClick?: (event: Click) => void; className?: string; height?: number; graphKey?: string }) {
  const element = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.EChartsType | null>(null);
  const frames = useRef<number[]>([]);
  const manualView = useRef(false);
  const previousGraph = useRef<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isGraph = graphKey !== undefined;
  const fitGraph = useCallback(() => {
    frames.current.forEach(cancelAnimationFrame);
    frames.current = [requestAnimationFrame(() => {
      frames.current.push(requestAnimationFrame(() => {
        const chart = instance.current, container = element.current;
        if (!chart || !container || chart.isDisposed() || manualView.current) return;
        try {
          const series = (chart.getOption().series as { zoom?: number }[])[0];
          const fit = graphViewportFit(graphPixels(chart), chart.getWidth(), chart.getHeight(), series.zoom ?? 1);
          if (!fit) return;
          chart.dispatchAction({ type: "graphRoam", seriesIndex: 0, zoom: fit.factor, originX: fit.centerX, originY: fit.centerY });
          chart.dispatchAction({ type: "graphRoam", seriesIndex: 0, dx: fit.dx, dy: fit.dy });
          container.dataset.graphFitted = "true";
          container.dataset.pageReady = "true";
        } catch { container.dataset.graphFitted = "false"; }
        finally { container.dataset.pageReady = "true"; }
      }));
    })];
  }, []);
  useEffect(() => {
    if (!element.current) return;
    const container = element.current;
    const chart = echarts.init(container, undefined, { renderer: "canvas" });
    const rendered = () => { if (!isGraph) container.dataset.pageReady = "true"; };
    chart.on("finished", rendered);
    instance.current = chart;
    const observer = new ResizeObserver(() => {
      container.dataset.pageReady = "false";
      resizeMeasuredChart(chart, container);
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        if (isGraph && !manualView.current) fitGraph();
        else container.dataset.pageReady = "true";
      }
    });
    observer.observe(container);
    return () => { frames.current.forEach(cancelAnimationFrame); observer.disconnect(); chart.off("finished", rendered); chart.dispose(); instance.current = null; };
  }, [fitGraph, isGraph]);
  useEffect(() => {
    if (!instance.current) return;
    try {
      if (element.current) element.current.dataset.pageReady = "false";
      instance.current.setOption(option, { notMerge: !isGraph });
      setFailed(false);
      if (graphKey !== undefined && previousGraph.current !== graphKey) {
        previousGraph.current = graphKey;
        manualView.current = false;
        if (element.current) element.current.dataset.graphFitted = "false";
        fitGraph();
      }
    }
    catch { if (element.current) element.current.dataset.pageReady = "true"; setFailed(true); }
  }, [option, graphKey, isGraph, fitGraph]);
  useEffect(() => {
    const chart = instance.current;
    if (!chart || !onClick) return;
    const handle = (event: unknown) => onClick(event as Click);
    chart.on("click", handle);
    return () => { chart.off("click", handle); };
  }, [onClick]);
  const zoom = (factor: number) => {
    const chart = instance.current;
    if (!chart) return;
    manualView.current = true;
    chart.dispatchAction({ type: "graphRoam", seriesIndex: 0, zoom: factor, originX: chart.getWidth() / 2, originY: chart.getHeight() / 2 });
  };
  const canvas = <div className={`knowledge-chart ${className}`} data-page-ready="false" style={height === undefined ? undefined : { height }} ref={element} role="img" aria-label={label}
    onPointerDown={isGraph ? () => { manualView.current = true; } : undefined} onWheelCapture={isGraph ? () => { manualView.current = true; } : undefined} />;
  return <>
    {isGraph ? <div className={`knowledge-graph-view${expanded ? " is-expanded" : ""}`}>
      <div className="knowledge-graph-controls" role="group" aria-label="图谱视野">
        <button className="button" type="button" onClick={() => { manualView.current = false; fitGraph(); }}>适应全图</button>
        <button className="button" type="button" aria-label="放大图谱" onClick={() => zoom(1.25)}>＋</button>
        <button className="button" type="button" aria-label="缩小图谱" onClick={() => zoom(0.8)}>−</button>
        <button className="button" type="button" aria-expanded={expanded} onClick={() => { manualView.current = false; setExpanded(value => !value); }}>{expanded ? "收起视图" : "展开视图"}</button>
      </div>{canvas}
    </div> : canvas}
    {failed ? <StatePanel compact kind="error" title="图表暂时无法绘制" /> : null}
  </>;
}

export function MetricChart({ items, kind, unit, label, compact = false }: { items: CountItem[]; kind: "bar" | "pie" | "line"; unit: string; label: string; compact?: boolean }) {
  const option = useMemo<EChartsOption>(() => {
    const common = { ...base, tooltip: { ...base.tooltip, valueFormatter: (value: unknown) => `${String(value)} ${unit}` } };
    if (kind === "pie") return { ...common, series: [{ type: "pie", radius: ["46%", "72%"], center: ["50%", "48%"], label: { show: false }, emphasis: { label: { show: true, formatter: "{b}\n{c}", color: "#5c3a26" } }, data: items }] };
    if (kind === "line") return {
      ...common, grid: { top: 22, right: 18, left: 45, bottom: 68 },
      xAxis: { type: "category", data: items.map((item) => item.name), axisLabel: { rotate: 30, width: 65, overflow: "truncate" } },
      yAxis: { type: "value", min: 0, max: 100, splitLine: { lineStyle: { color: "#e5dcd0" } } },
      series: [{ type: "line", data: items.map((item) => item.value), symbolSize: 8, smooth: false, lineStyle: { color: palette[1] }, itemStyle: { color: palette[1] } }],
    };
    return {
      ...common, grid: { top: 14, right: 38, left: 105, bottom: 24 },
      xAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#e5dcd0" } } },
      yAxis: { type: "category", inverse: true, data: items.map((item) => item.name), axisLabel: { width: 90, overflow: "truncate" }, axisTick: { show: false }, axisLine: { show: false } },
      series: [{ type: "bar", data: items.map((item) => item.value), barMaxWidth: 19, label: { show: true, position: "right", color: "#6b5f4e" }, itemStyle: { borderRadius: [0, 3, 3, 0] } }],
    };
  }, [items, kind, unit]);
  return <><CanvasChart option={option} label={label} height={compact ? paintingChartHeight(kind, items.length) : undefined} />{kind === "pie" ? <ul className="knowledge-legend" aria-label={`${label}图例`}>{items.map((item, index) => <li key={`${item.name}-${index}`}><span style={{ background: palette[index % palette.length] }} aria-hidden="true" /><b>{item.name}</b><em>{item.value}</em></li>)}</ul> : null}</>;
}

export function PoetryChart({ nodes, links, selectedId, focused, onNode, onEdge }: {
  nodes: PoetryNode[]; links: PoetryLink[]; selectedId: string | null; focused: boolean;
  onNode: (id: string) => void; onEdge: (link: PoetryLink) => void;
}) {
  const graphDescription = `诗词力导向图，${nodes.length} 个实体、${links.length} 条关系；可通过下方实体卡和关系列表进行键盘操作`;
  const option = useMemo<EChartsOption>(() => {
    const categories = [...new Set(nodes.map((node) => node.category))];
    const neighbors = selectedId ? neighborIds(links, selectedId) : null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return {
      ...base, animation: !reducedMotion,
      aria: { enabled: true, label: { description: graphDescription } },
      series: [{
        id: "poetry-network", type: "graph", layout: "force", roam: true, draggable: true,
        scaleLimit: { min: 0.01, max: 8 },
        force: { repulsion: focused ? 240 : 100, gravity: 0.07, edgeLength: [40, 105], layoutAnimation: false },
        categories: categories.map((name) => ({ name })),
        label: { show: focused || nodes.length < 45, position: "right", color: "#514534", fontSize: 11 },
        edgeSymbol: ["none", "none"],
        emphasis: { focus: "adjacency", label: { show: true }, lineStyle: { width: 3 } },
        data: nodes.map((node) => ({ id: node.id, name: node.name, category: categories.indexOf(node.category), symbolSize: node.id === selectedId ? 27 : Math.min(20, Math.max(7, node.size / 1.4)), itemStyle: { opacity: !neighbors || neighbors.has(node.id) ? 1 : 0.14, borderWidth: node.id === selectedId ? 3 : 1, borderColor: node.id === selectedId ? "#332b20" : "#fbf7ed" }, label: { show: node.id === selectedId || focused || nodes.length < 45 } })),
        links: links.map((link) => ({ source: link.source, target: link.target, value: link.value, name: link.label, lineStyle: { opacity: !selectedId || link.source === selectedId || link.target === selectedId ? 0.58 : 0.06, width: selectedId && (link.source === selectedId || link.target === selectedId) ? 2 : 0.8, color: "#8d9a86", curveness: 0.08 } })),
      }],
    };
  }, [focused, graphDescription, links, nodes, selectedId]);
  const graphKey = `${focused}:${nodes.map(node => node.id).join("|")}`;
  return <CanvasChart option={option} label={graphDescription} graphKey={graphKey} className="knowledge-graph" onClick={(event) => {
    if (event.dataType === "edge" && typeof event.dataIndex === "number" && links[event.dataIndex]) onEdge(links[event.dataIndex]);
    else if (event.data?.id) onNode(event.data.id);
  }} />;
}
