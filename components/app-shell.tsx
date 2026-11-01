"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

import { MiniAppBackButton } from "@/components/miniapp-back-button";
import { Navigation } from "@/components/navigation";
import { BackToTop } from "@/components/back-to-top";
import { SiteFooter } from "@/components/site-footer";
import { ProtectedRoute } from "@/components/protected-route";
import { requiresAuthentication } from "@/lib/navigation";
import { RouteMotion } from "@/components/route-motion";
import { ArtworkTransition } from "@/components/artwork-transition";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const home = pathname === "/";
  const content = <>{children}{!home ? <><SiteFooter /><BackToTop /></> : null}</>;
  return (
    <>
      <Script src="https://res.wx.qq.com/open/js/jweixin-1.6.0.js" strategy="afterInteractive" />
      <Navigation />
      <MiniAppBackButton />
      <RouteMotion />
      <ArtworkTransition />
      {requiresAuthentication(pathname) ? <ProtectedRoute>{content}</ProtectedRoute> : content}
    </>
  );
}
