import Script from "next/script";

import { MiniAppBackButton } from "@/components/miniapp-back-button";
import { Navigation } from "@/components/navigation";
import { BackToTop } from "@/components/back-to-top";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://res.wx.qq.com/open/js/jweixin-1.6.0.js" strategy="afterInteractive" />
      <Navigation />
      <MiniAppBackButton />
      {children}
      <footer className="site-footer">
        <span>ArtLIVE 画智体</span>
        <span>让中国画在数字空间中被看见、理解与延续</span>
      </footer>
      <BackToTop />
    </>
  );
}
