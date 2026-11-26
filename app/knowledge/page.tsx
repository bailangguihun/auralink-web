import type { Metadata } from "next";
import { KnowledgeScreen } from "@/components/knowledge-screen";
export const metadata: Metadata = { title: "知识库" };
export default function KnowledgePage() { return <KnowledgeScreen />; }
