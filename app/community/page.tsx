import type { Metadata } from "next";
import { CommunityV2Screen } from "@/components/community/community-v2-screen";
export const metadata: Metadata = { title: "社区" };
export default function CommunityPage() {
  return <main className="community-v2-page"><CommunityV2Screen /></main>;
}
