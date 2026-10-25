import { KnowledgeLoading } from "@/components/page-loading";
import type { Metadata } from "next";
import { KnowledgeScreen } from "@/components/knowledge-screen";
import { ProtectedRoute } from "@/components/protected-route";
export const metadata: Metadata = { title: "知识库" };
export default function KnowledgePage() { return <ProtectedRoute fallback={<KnowledgeLoading />}><KnowledgeScreen /></ProtectedRoute>; }
