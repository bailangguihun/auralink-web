import type { Metadata } from "next";
import { CommunityScreen } from "@/components/community/community-screen";
import { CommunityLoading } from "@/components/community/community-loading";
import { ProtectedRoute } from "@/components/protected-route";
export const metadata: Metadata = { title: "社区" };
export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ paintingId?: string }> }) {
  const query = await searchParams;
  return <main className="page-shell community-page"><ProtectedRoute fallback={<CommunityLoading />}>
    <CommunityScreen initialPaintingId={typeof query.paintingId === "string" ? query.paintingId : null} />
  </ProtectedRoute></main>;
}
