import { ProfileSkeleton } from "@/components/loading";
import type { Metadata } from "next";

import { MeScreen } from "@/components/me-screen";
import { ProtectedRoute } from "@/components/protected-route";

export const metadata: Metadata = { title: "个人中心" };

export default function MePage() {
  return <main className="page-shell me-page"><ProtectedRoute fallback={<ProfileSkeleton />}><MeScreen /></ProtectedRoute></main>;
}
