import { CommunityLoading } from "@/components/community/community-loading";

// Post details keep their existing shell instead of inheriting the landing header.
export default function Loading() {
  return <main className="page-shell community-page"><CommunityLoading /></main>;
}
