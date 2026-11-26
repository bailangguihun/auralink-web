import { LoadingSection, Skeleton, SkeletonRows } from "@/components/loading";
import { ModuleHeader } from "@/components/module-header";

export function CommunityPageLoading() {
  return <main className="community-v2-page"><CommunityLoading /></main>;
}

export function CommunityLoading() {
  return <div className="community-loading-layout">
    <div className="community-loading-sidebar glass-panel" aria-hidden="true"><SkeletonRows lines={8} /></div>
    <div className="community-loading-main">
      <ModuleHeader module="community" />
      <LoadingSection label="正在读取社区"><div className="community-feed">
        {[0, 1, 2].map(i => <article className="community-card glass-panel" key={i}>
          <Skeleton className="skeleton-short" /><SkeletonRows lines={3} />
        </article>)}
      </div></LoadingSection>
    </div>
  </div>;
}
