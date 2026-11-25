import type { Metadata } from "next";
import { Suspense } from "react";
import { GalleryScreen } from "@/components/gallery-screen";
import { GalleryLoading } from "@/components/page-loading";

export const metadata: Metadata = { title: "画廊" };
export default function GalleryPage() {
  return <Suspense fallback={<GalleryLoading />}><GalleryScreen /></Suspense>;
}
