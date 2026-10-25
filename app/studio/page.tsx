import { StudioSkeleton } from "@/components/loading";
import type { Metadata } from "next";
import { ProtectedRoute } from "@/components/protected-route";
import { StudioScreen } from "@/components/studio-screen";

export const metadata: Metadata = { title: "创作工坊" };

export default function StudioPage() {
  return (
    <main className="page-shell studio-page">
      <header className="page-header glass-panel">
        <div><h1>创作工坊</h1><p>从后端能力发现、私有工作流到异步 Creation，全程以真实状态为准。</p></div>
      </header>
      <ProtectedRoute fallback={<StudioSkeleton />}><StudioScreen /></ProtectedRoute>
    </main>
  );
}
