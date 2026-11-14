"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "@/components/session-provider";
import { hasArtworkTransition } from "@/components/artwork-transition";
import { startPresentation } from "@/lib/content-presentation";

/** Keep the destination mounted and measurable, but hidden from the first SSR paint. */
export function RouteMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status, sessionIdentity } = useSession();
  const latest = useRef({ status, generation: sessionIdentity.generation });
  latest.current = { status, generation: sessionIdentity.generation };
  const content = useRef<HTMLDivElement>(null);
  const [failedPath, setFailedPath] = useState<string | null>(null);

  useLayoutEffect(() => {
    const root = content.current;
    if (!root) return;
    setFailedPath(null);
    const presentation = startPresentation(root, {
      kind: "route", page: true,
      ready: () => latest.current.status !== "loading",
      current: () => location.pathname === pathname,
      artwork: () => hasArtworkTransition(pathname, latest.current.generation),
      onTimeout: () => setFailedPath(pathname),
    });
    return presentation.cancel;
  }, [pathname]);

  return <>
    <div ref={content} className="route-content" data-route-path={pathname} data-route-phase="preparing">{children}</div>
    {failedPath === pathname ? <main className="page-shell route-preparation-error"><section className="state-panel state-error" role="alert">
      <div><h1>页面暂未准备完成</h1><p>部分内容仍未完成读取，请重新载入，或通过顶部导航前往其他页面。</p>
        <button className="button button-primary" onClick={() => location.reload()}>重新载入页面</button></div>
    </section></main> : null}
    <noscript><style>{`.route-content[data-route-phase="preparing"], .content-reveal-region[data-content-phase="preparing"] { opacity: 1; visibility: visible; pointer-events: auto; }`}</style></noscript>
  </>;
}
