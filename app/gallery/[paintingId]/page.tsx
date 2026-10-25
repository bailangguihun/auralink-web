import { DetailSkeleton, LoadingSection } from "@/components/loading";
import type { Metadata } from "next";

import { PaintingDetailScreen } from "@/components/painting-detail-screen";
import { ProtectedRoute } from "@/components/protected-route";

export const metadata: Metadata = { title: "作品详情" };

export default async function PaintingDetailPage({ params }: { params: Promise<{ paintingId: string }> }) {
  const { paintingId } = await params;
  return (
    <main className="page-shell detail-page">
      <ProtectedRoute fallback={<LoadingSection label="正在确认作品访问权限"><DetailSkeleton /></LoadingSection>}><PaintingDetailScreen paintingId={paintingId} /></ProtectedRoute>
    </main>
  );
}
