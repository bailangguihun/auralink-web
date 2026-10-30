"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Decorative only. A containing LoadingSection owns the single status message. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`paper-skeleton ${className}`} />;
}

export function SkeletonRows({ lines = 3 }: { lines?: number }) {
  return <div className="skeleton-lines" aria-hidden="true">{Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={i === lines - 1 ? "skeleton-short" : ""} />)}</div>;
}

/** No minimum display time, automatic retry, percentage or generated task state. */
export function LoadingStatus({ label = "正在读取…", onRetry, quiet = false }: { label?: string; onRetry?: () => void; quiet?: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSlow(true), 10000); return () => clearTimeout(timer); }, []);
  return <div className="loading-status">
    <span role={quiet ? undefined : "status"}><PendingIndicator />{slow ? `${label} 读取时间较长，仍在等待响应。` : label}</span>
    {slow && onRetry ? <button className="text-button" type="button" onClick={onRetry}>重新读取</button> : null}
  </div>;
}

export function PendingIndicator() { return <span className="pending-indicator" aria-hidden="true" />; }

export function LoadingSection({ label, children, onRetry, className = "" }: { label: string; children: ReactNode; onRetry?: () => void; className?: string }) {
  return <section className={`loading-section ${className}`} aria-label={label}>
    <div aria-hidden="true" aria-busy="true">{children}</div><LoadingStatus label={label} onRetry={onRetry} />
  </section>;
}

export function DailyPaintingSkeleton() {
  return <div className="daily-card skeleton-daily">
    <div className="daily-media"><Skeleton className="skeleton-image" /></div>
    <div className="daily-copy">
      <div className="daily-heading"><span className="daily-heading-label">每日一画</span><span aria-hidden="true">·</span><Skeleton className="skeleton-daily-date" /></div>
      <Skeleton className="skeleton-title" />
      <Skeleton className="skeleton-daily-meta" />
      <div className="skeleton-daily-description"><Skeleton /><Skeleton className="skeleton-short" /></div>
      <Skeleton className="skeleton-daily-action" />
    </div>
  </div>;
}

export function PaintingGridSkeleton({ count = 6, personal = false, rows = false }: { count?: number; personal?: boolean; rows?: boolean }) {
  if (rows) return <div className="gallery-row-skeleton" aria-hidden="true">{Array.from({ length: count }, (_, i) => <div key={i} className="painting-card glass-panel gallery-painting-card"><div className="painting-media"><Skeleton className="skeleton-image" /></div><div className="painting-copy"><SkeletonRows lines={2} /></div><div className="painting-meta"><Skeleton className="skeleton-short" /></div></div>)}</div>;
  return <div className={`painting-grid${personal ? " me-painting-grid" : ""}`} aria-hidden="true">{Array.from({ length: count }, (_, i) => <div key={i} className="painting-card glass-panel"><div className="painting-media"><Skeleton className="skeleton-image" /></div><div className="painting-copy"><SkeletonRows /></div><div className="painting-meta"><Skeleton className="skeleton-short" /></div></div>)}</div>;
}

export function ChartSkeleton({ compact = false }: { compact?: boolean }) {
  return <div className={`skeleton-chart${compact ? " skeleton-chart-compact" : ""}`} aria-hidden="true"><Skeleton className="skeleton-short" /><div className="skeleton-chart-frame" /></div>;
}

export function KnowledgeSkeleton({ graph = false }: { graph?: boolean }) {
  return <><div className="knowledge-counts" aria-hidden="true">{[0, 1].map(i => <section key={i} className="knowledge-count glass-panel"><Skeleton className="skeleton-short" /><Skeleton className="skeleton-title" /></section>)}</div>
    <div className={graph ? "" : "knowledge-grid knowledge-painting-grid"}>{Array.from({ length: graph ? 1 : 4 }, (_, i) => <div className="knowledge-panel glass-panel" key={i}><ChartSkeleton compact={!graph} /></div>)}</div></>;
}

export function DetailSkeleton() {
  return <><div className="skeleton-breadcrumb"><Skeleton className="skeleton-short" /></div><div className="detail-layout" aria-hidden="true"><div className="detail-media glass-panel"><Skeleton className="skeleton-image skeleton-detail-image" /></div><div className="detail-copy glass-panel"><Skeleton className="skeleton-title" /><SkeletonRows lines={6} /></div></div></>;
}

export function CreationGridSkeleton() {
  return <div className="creation-grid" aria-hidden="true">{[0, 1, 2].map(i => <div className="creation-card glass-panel" key={i}><Skeleton className="skeleton-short" /><SkeletonRows /></div>)}</div>;
}

export function StudioSkeleton() {
  return <div className="studio-layout studio-layout-redesigned"><LoadingSection label="正在确认创作能力"><section className="workflow-designer glass-panel"><div className="workflow-designer-header"><Skeleton className="skeleton-title" /><Skeleton className="skeleton-short" /></div><div className="skeleton-workflow"><SkeletonRows lines={2} /><Skeleton className="skeleton-image" /></div></section></LoadingSection><section className="studio-creations"><h2>我的作品</h2><LoadingSection label="正在读取我的作品"><CreationGridSkeleton /></LoadingSection></section></div>;
}

export function ProfileSkeleton() {
  return <div className="me-layout"><aside className="me-sidebar glass-panel"><LoadingSection label="正在确认个人资料"><Skeleton className="skeleton-avatar" /><SkeletonRows /></LoadingSection></aside><div className="me-content"><section className="profile-panel glass-panel"><h2>账号信息</h2><SkeletonRows lines={4} /></section><section className="favorites-panel"><h2>我的收藏</h2><LoadingSection label="正在确认收藏访问权限"><PaintingGridSkeleton personal count={3} /></LoadingSection></section></div></div>;
}

export function MediaLoading({ audio = false, onRetry }: { audio?: boolean; onRetry?: () => void }) {
  return <LoadingSection label="正在安全读取已保存媒体" onRetry={onRetry}><div className={audio ? "skeleton-audio" : "skeleton-media-preview"}><Skeleton className="skeleton-image" /></div></LoadingSection>;
}
