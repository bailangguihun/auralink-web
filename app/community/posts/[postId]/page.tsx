import type { Metadata } from "next";
import { CommunityScreen } from "@/components/community/community-screen";
import { CommunityLoading } from "@/components/community/community-loading";
import { ProtectedRoute } from "@/components/protected-route";
export const metadata: Metadata = { title: "社区帖子" };
export default async function CommunityPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  return <main className="page-shell community-page"><ProtectedRoute fallback={<CommunityLoading />}>
    <CommunityScreen key={postId} postId={postId} />
  </ProtectedRoute></main>;
}
