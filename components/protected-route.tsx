"use client";

import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect } from "react";

import { StatePanel } from "@/components/state-panel";
import { useSession } from "@/components/session-provider";
import { loginHref } from "@/lib/navigation";

export function ProtectedRoute({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const { status, restore, sessionIdentity } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status !== "anonymous") return;
    router.replace(loginHref(`${pathname}${window.location.search}${window.location.hash}`));
  }, [pathname, router, status]);

  if (status === "loading") {
    return fallback ?? <main className="page-shell"><StatePanel kind="loading" title="正在确认登录状态" description="正在连接 ArtLIVE 服务。" /></main>;
  }
  if (status === "error") {
    return (
      <main className="page-shell"><StatePanel
        kind="error"
        title="暂时无法恢复登录状态"
        description="登录凭据仍保留在本机，请在服务恢复后重试。"
        actionLabel="重新连接"
        onAction={() => void restore()}
      /></main>
    );
  }
  if (status !== "authenticated") {
    return null;
  }
  return <Fragment key={sessionIdentity.generation}>{children}</Fragment>;
}
