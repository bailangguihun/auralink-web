import { DailyPainting } from '@/components/daily-painting';
import { ModuleHeader } from '@/components/module-header';
import { KnowledgeSkeleton, LoadingSection, PaintingGridSkeleton, ProfileSkeleton, StudioSkeleton } from '@/components/loading';

export function GalleryLoading() {
  return <main className="page-shell module-page gallery-page"><ModuleHeader module="gallery"><span className="catalog-status">正在读取目录</span></ModuleHeader><DailyPainting painting={null} loading /><div className="gallery-filters glass-panel"><input disabled aria-label="关键词（正在打开画廊）" placeholder="搜索作品、作者、风格或意境" /><button className="button" disabled>更多筛选</button><button className="button" disabled>检索画作</button></div><LoadingSection label="正在读取画作目录"><PaintingGridSkeleton count={6} rows /></LoadingSection></main>;
}
export function KnowledgeLoading() {
  return <main className="page-shell module-page knowledge-page"><ModuleHeader module="knowledge" /><div className="knowledge-tabs"><button disabled>国画统计</button><button disabled>诗词图谱</button></div><LoadingSection label="正在确认知识库访问权限"><KnowledgeSkeleton /></LoadingSection></main>;
}
export function StudioPageLoading() {
  return <main className="page-shell module-page studio-page"><ModuleHeader module="studio" /><StudioSkeleton /></main>;
}
export function ProfilePageLoading() { return <main className="page-shell me-page"><ProfileSkeleton /></main>; }
