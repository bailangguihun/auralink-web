import { StudioSkeleton } from "@/components/loading";
import type { Metadata } from "next";
import { ProtectedRoute } from "@/components/protected-route";
import { StudioScreen } from "@/components/studio-screen";
import { ModuleHeader } from "@/components/module-header";

export const metadata: Metadata = { title: "创作工坊" };

export default function StudioPage() {
  return (
    <main className="page-shell module-page studio-page">
      <ModuleHeader module="studio" />
      <ProtectedRoute fallback={<StudioSkeleton />}><StudioScreen /></ProtectedRoute>
    </main>
  );
}
