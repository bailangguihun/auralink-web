import { LoadingSection, Skeleton, SkeletonRows } from "@/components/loading";
export default function Loading() {
  return <main className="page-shell"><LoadingSection label="正在打开页面"><div className="page-header glass-panel"><Skeleton className="skeleton-title" /></div><div className="route-skeleton glass-panel"><SkeletonRows lines={4} /></div></LoadingSection></main>;
}
