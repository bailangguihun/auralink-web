import { DailyPaintingSkeleton, KnowledgeSkeleton, LoadingSection, PaintingGridSkeleton, ProfileSkeleton, StudioSkeleton } from '@/components/loading';

export function GalleryLoading() {
  return <main className="page-shell gallery-page"><header className="page-header glass-panel gallery-header"><div><h1>笔墨之间，自有天地</h1><p>从真实官方目录中检索作品、作者与画意</p></div><span className="catalog-status">正在读取目录</span></header><section className="daily-panel glass-panel"><div className="daily-heading"><h2>每日一画</h2></div><LoadingSection label="正在选择今日画作"><DailyPaintingSkeleton /></LoadingSection></section><div className="gallery-filters glass-panel"><input disabled aria-label="关键词（正在打开画廊）" placeholder="搜索作品、作者、风格或意境" /><button className="button" disabled>更多筛选</button><button className="button" disabled>检索画作</button></div><LoadingSection label="正在读取画作目录"><PaintingGridSkeleton count={12} /></LoadingSection></main>;
}
export function KnowledgeLoading() {
  return <main className="page-shell knowledge-page"><header className="knowledge-header glass-panel"><h1>观画有据，读诗有脉</h1></header><div className="knowledge-tabs"><button disabled>国画统计</button><button disabled>诗词图谱</button></div><LoadingSection label="正在确认知识库访问权限"><KnowledgeSkeleton /></LoadingSection></main>;
}
export function StudioPageLoading() {
  return <main className="page-shell studio-page"><header className="page-header glass-panel"><div><h1>创作工坊</h1><p>从后端能力发现、私有工作流到异步 Creation，全程以真实状态为准。</p></div></header><StudioSkeleton /></main>;
}
export function ProfilePageLoading() { return <main className="page-shell me-page"><ProfileSkeleton /></main>; }
