import type { Metadata } from "next";
import { CommunityScreen } from "@/components/community/community-screen";
import { CommunityLoading } from "@/components/community/community-loading";
import { ProtectedRoute } from "@/components/protected-route";
import { ModuleHeader } from "@/components/module-header";
export const metadata: Metadata = { title: "社区" };
export default async function CommunityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const initialSearch = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : [])).toString();
  return <main className="page-shell module-page community-page"><ModuleHeader module="community" /><ProtectedRoute fallback={<CommunityLoading />}>
    <CommunityScreen initialPaintingId={typeof query.paintingId === "string" ? query.paintingId : null} initialSearch={initialSearch} />
  </ProtectedRoute></main>;
}
