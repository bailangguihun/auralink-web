import type { Metadata } from "next";
import { CommunityV2Screen } from "@/components/community/community-v2-screen";
import { CommunityLoading } from "@/components/community/community-loading";
import { ProtectedRoute } from "@/components/protected-route";
export const metadata: Metadata = { title: "社区" };
export default function CommunityPage() {
  return <main className="community-v2-page"><ProtectedRoute fallback={<CommunityLoading />}>
    <CommunityV2Screen />
  </ProtectedRoute></main>;
}
