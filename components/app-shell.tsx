"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

import { MiniAppBackButton } from "@/components/miniapp-back-button";
import { Navigation } from "@/components/navigation";
import { BackToTop } from "@/components/back-to-top";
import { SiteFooter } from "@/components/site-footer";

export function AppShell({ children }: { children: React.ReactNode }) {
  const home = usePathname() === "/";
  return (
    <>
      <Script src="https://res.wx.qq.com/open/js/jweixin-1.6.0.js" strategy="afterInteractive" />
      <Navigation />
      <MiniAppBackButton />
      {children}
      {!home ? <><SiteFooter /><BackToTop /></> : null}
    </>
  );
}
