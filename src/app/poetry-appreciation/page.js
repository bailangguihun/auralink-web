'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Navbar from '@/components/Navbar';
import { useRouter } from 'next/navigation';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export default function PoetryAppreciationPage() {
  const router = useRouter();
  const [graphData, setGraphData] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const [relationTopK, setRelationTopK] = useState(10);
  const chartInstanceRef = useRef(null);
  const idToName = useMemo(() => {
    const map = new Map();
    if (graphData && graphData.nodes) {
      graphData.nodes.forEach(n => map.set(n.id, n.name || n.id));
    }
    return map;
  }, [graphData]);

  const escapeHtml = (text) => {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  useEffect(() => {
    // 登录校验
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (!token) {
        router.push('/login');
        return;
      }
    } catch {}
    const load = async () => {
      const [g, s] = await Promise.all([
        fetch('/data/poetry-graph.json').then(r => r.json()),
        fetch('/data/poetry-stats.json').then(r => r.json()),
      ]);
      setGraphData(g);
      setStatsData(s);
    };
    load();
  }, []);

  const filteredNodes = useMemo(() => {
    if (!graphData) return [];
    if (!search.trim()) return graphData.nodes;
    const q = search.trim().toLowerCase();
    return graphData.nodes.filter(n =>
      (n.name || '').toLowerCase().includes(q) ||
      (n.category || '').toLowerCase().includes(q)
    );
  }, [graphData, search]);

  const filteredLinks = useMemo(() => {
    if (!graphData) return [];
    const ids = new Set(filteredNodes.map(n => n.id));
    return graphData.links.filter(l => ids.has(l.source) && ids.has(l.target));
  }, [graphData, filteredNodes]);

  const graphOption = useMemo(() => {
    if (!graphData) return {};
    const categories = Array.from(new Set(graphData.nodes.map(n => n.category)));
    const oneHopIds = new Set();
    if (selectedId) {
      oneHopIds.add(selectedId);
      graphData.links.forEach(l => {
        if (l.source === selectedId) oneHopIds.add(l.target);
        if (l.target === selectedId) oneHopIds.add(l.source);
      });
    }
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        confine: true,
        renderMode: 'html',
        extraCssText:
          'max-width:520px; white-space:normal; word-break:break-word; overflow-wrap:anywhere;',
        formatter: (params) => {
          if (params.dataType === 'node') {
            const d = params.data;
            const title = escapeHtml(d.name || d.id);
            const descRaw = d.description || '';
            const desc = escapeHtml(descRaw).replace(/\n/g, '<br/>'); // 描述换行
            return `
              <div>
                <div style="font-weight:700;margin-bottom:6px;">${title}</div>
                <div style="font-style:italic;opacity:.9;line-height:1.5;">${desc}</div>
              </div>
            `;
          }
          if (params.dataType === 'edge') {
            const e = params.data;
            const summary = escapeHtml(e.summary || e.label || '');
            const detail = escapeHtml(e.detail || '').replace(/\n/g, '<br/>');
            const s = escapeHtml(idToName.get(e.source) || e.source);
            const t = escapeHtml(idToName.get(e.target) || e.target);
            return `
              <div>
                <div style="font-weight:700;margin-bottom:6px;">${s} → ${t}</div>
                <div style="margin-bottom:4px">${summary}</div>
                <div style="font-style:italic;opacity:.9;line-height:1.5;">${detail}</div>
              </div>
            `;
          }
    return '';
  }
      },
      legend: [{
        data: categories,
        textStyle: { color: '#d1d5db' },
      }],
      series: [{
        type: 'graph',
        layout: 'force',
        data: filteredNodes.map(n => ({
          ...n,
          symbolSize: n.size || 20,
          itemStyle: selectedId ? (oneHopIds.has(n.id) ? { opacity: 1 } : { opacity: 0.25 }) : undefined,
        })),
        links: filteredLinks.map(l => ({
          ...l,
          lineStyle: selectedId ? ((l.source === selectedId || l.target === selectedId || (oneHopIds.has(l.source) && oneHopIds.has(l.target))) ? { opacity: 0.9 } : { opacity: 0.15 }) : undefined
        })),
        categories: categories.map(c => ({ name: c })),
        roam: true,
        label: { show: true, color: '#e5e7eb' },
        lineStyle: { color: '#555', opacity: 0.6 },
        force: { repulsion: 120, edgeLength: 80 },
      }],
    };
  }, [graphData, filteredNodes, filteredLinks, selectedId]);

  const pieOption = useMemo(() => {
    if (!statsData) return {};
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      legend: { show: false },
      series: [
        {
          name: '实体类型',
          type: 'pie',
          radius: ['30%', '60%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#0b0b0d', borderWidth: 2 },
          label: { show: true, color: '#e5e7eb', formatter: '{b} {d}%'} ,
          data: statsData.entityTypeDistribution.map(([name, value]) => ({ name, value })),
        },
      ],
    };
  }, [statsData]);

  const relationPieOption = useMemo(() => {
    if (!statsData) return {};
    const src = (statsData.relationTypeDistribution || []).slice();
    // 排序并聚合
    let data = src.sort((a, b) => b[1] - a[1]);
    if (relationTopK && relationTopK > 0) {
      const top = data.slice(0, relationTopK);
      const rest = data.slice(relationTopK);
      const otherVal = rest.reduce((sum, [, v]) => sum + v, 0);
      data = otherVal > 0 ? [...top, ['其他', otherVal]] : top;
    }
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      legend: { show: false },
      series: [
        {
          name: '关系类型',
          type: 'pie',
          radius: ['30%', '60%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#0b0b0d', borderWidth: 2 },
          label: { show: true, color: '#e5e7eb', formatter: '{b} {d}%'} ,
          data: data.map(([name, value]) => ({ name, value })),
        },
      ],
    };
  }, [statsData, relationTopK]);

  const pagedEntities = useMemo(() => {
    const nodes = filteredNodes;
    const start = (currentPage - 1) * pageSize;
    return nodes.slice(start, start + pageSize);
  }, [filteredNodes, currentPage]);

  const totalPages = useMemo(() => {
    return Math.ceil((filteredNodes.length || 0) / pageSize) || 1;
  }, [filteredNodes]);

  const centerOnNodeById = (id) => {
    const chart = chartInstanceRef.current;
    if (!chart) return;
    const idx = filteredNodes.findIndex((n) => n.id === id);
    if (idx < 0) return;
    try {
      // 高亮一跳邻域
      chart.dispatchAction({ type: 'unfocusNodeAdjacency', seriesIndex: 0 });
      chart.dispatchAction({ type: 'focusNodeAdjacency', seriesIndex: 0, dataIndex: idx });

      // 定位到画布中心
      const model = chart.getModel();
      const seriesModel = model.getSeriesByIndex(0);
      const data = seriesModel.getData();
      const layout = data.getItemLayout(idx);
      if (layout && typeof layout.x === 'number' && typeof layout.y === 'number') {
        const cx = chart.getWidth() / 2;
        const cy = chart.getHeight() / 2;
        const dx = cx - layout.x;
        const dy = cy - layout.y;
        chart.dispatchAction({ type: 'graphRoam', seriesIndex: 0, dx, dy });
      }
    } catch (e) {
      // 忽略内部API差异导致的定位失败
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black relative overflow-hidden">
      <Navbar />
      <div className="container mx-auto pt-24 pb-16 px-6 relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-amber-300 to-amber-600 bg-clip-text text-transparent">
            诗词知识图谱
          </h1>
          <p className="text-gray-400 mt-2">探索诗人、诗作、意象与朝代之间的关联</p>
        </div>

        <div className="flex flex-col md:flex-row gap-6 items-stretch">
          <div className="md:w-2/3 bg-black/40 backdrop-blur-md border border-amber-900/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-amber-400 font-semibold">知识图谱</h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索诗人/诗词/类别..."
                className="bg-black/40 border border-amber-900/30 rounded-md px-3 py-2 text-gray-200 outline-none focus:border-amber-500/60"
              />
            </div>
            <div style={{ height: 'clamp(560px, calc(100vh - 240px), 820px)' }}>
              {graphData && (
                <ReactECharts
                  style={{ height: '100%' }}
                  option={graphOption}
                  notMerge={true}
                  lazyUpdate={true}
                  onChartReady={(chart) => { chartInstanceRef.current = chart; }}
                  onEvents={{
                    click: (params) => {
                      if (params.dataType === 'node') {
                        const id = params.data.id;
                        setSelectedId(prev => (prev === id ? null : id));
                        centerOnNodeById(id);
                      }
                    }
                  }}
                />
              )}
            </div>
          </div>

          <div className="md:w-1/3 bg-black/40 backdrop-blur-md border border-amber-900/30 rounded-xl p-4">
            <h2 className="text-amber-400 font-semibold mb-3">实体类型分布</h2>
            <div className="h-[280px]">
              {statsData && <ReactECharts style={{ height: '100%' }} option={pieOption} />}
            </div>
            {statsData && (
              <div className="mt-4 text-gray-300 text-sm space-y-1">
                <div>实体总数：{statsData.overview.entities}</div>
                <div>关系总数：{statsData.overview.relations}</div>
                <div>诗词数量：{statsData.overview.poems}</div>
                <div>诗人数量：{statsData.overview.poets}</div>
              </div>
            )}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-amber-400 font-semibold">关系类型分布</h2>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="opacity-80">首选项目数</span>
                  <select
                    value={relationTopK}
                    onChange={(e) => setRelationTopK(Number(e.target.value))}
                    className="bg-black/40 border border-amber-900/30 rounded-md px-2 py-1 text-gray-200 outline-none focus:border-amber-500/60"
                    title="选择Top-K聚合，0为全部"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={20}>20</option>
                    <option value={0}>全部</option>
                  </select>
                </div>
              </div>
              <div className="h-[260px]">
                {statsData && <ReactECharts style={{ height: '100%' }} option={relationPieOption} />}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-black/40 backdrop-blur-md border border-amber-900/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-amber-400 font-semibold">实体列表</h2>
            <div className="text-sm text-gray-400">共 {filteredNodes.length || 0} 条</div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pagedEntities.map(n => (
              <button
                key={n.id}
                className={`text-left bg-black/30 border ${selectedId === n.id ? 'border-amber-500/60' : 'border-amber-900/30'} rounded-md px-3 py-2 text-gray-200 hover:border-amber-500/60 transition-colors`}
                onClick={() => { setSelectedId(prev => (prev === n.id ? null : n.id)); centerOnNodeById(n.id); }}
                title={`类型：${n.category}`}
              >
                <div className="font-medium text-amber-300 truncate">{n.name}</div>
                <div className="text-xs opacity-80 truncate">{n.category}</div>
                {n.description && (
                  <div className="text-xs opacity-90 mt-1" style={{ fontStyle: 'italic', whiteSpace: 'pre-line' }}>{n.description}</div>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              className="px-3 py-1 rounded-md border border-amber-900/30 text-gray-300 bg-black/20 hover:bg-black/40 disabled:opacity-50"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >上一页</button>
            <div className="text-gray-400 text-sm">{currentPage} / {totalPages}</div>
            <button
              className="px-3 py-1 rounded-md border border-amber-900/30 text-gray-300 bg-black/20 hover:bg-black/40 disabled:opacity-50"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >下一页</button>
          </div>
        </div>
      </div>
    </main>
  );
}


