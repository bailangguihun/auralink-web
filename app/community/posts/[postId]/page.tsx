import type { Metadata } from "next";
import {redirect} from "next/navigation";
export const metadata: Metadata = { title: "社区帖子" };
export default async function CommunityPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  redirect('/community?legacyPost='+encodeURIComponent(postId));
}
