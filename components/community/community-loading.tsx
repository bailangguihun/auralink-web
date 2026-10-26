import { LoadingSection, Skeleton, SkeletonRows } from "@/components/loading";
export function CommunityLoading() {
  return <LoadingSection label="正在读取社区"><div className="community-feed">
    {[0, 1, 2].map(i => <article className="community-card glass-panel" key={i}>
      <Skeleton className="skeleton-short" /><SkeletonRows lines={3} />
    </article>)}
  </div></LoadingSection>;
}
