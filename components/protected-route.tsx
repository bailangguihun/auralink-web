"use client";

import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect } from "react";

import { StatePanel } from "@/components/state-panel";
import { useSession } from "@/components/session-provider";

export function ProtectedRoute({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const { status, restore, sessionIdentity } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status !== "anonymous") return;
    const query = window.location.search.replace(/^\?/, "");
    const returnTo = `${pathname}${query ? `?${query}` : ""}`;
    router.replace(`/login?next=${encodeURIComponent(returnTo)}`);
  }, [pathname, router, status]);

  if (status === "loading") {
    return fallback ?? <StatePanel kind="loading" title="正在确认登录状态" description="正在连接 ArtLIVE 服务。" />;
  }
  if (status === "error") {
    return (
      <StatePanel
        kind="error"
        title="暂时无法恢复登录状态"
        description="登录凭据仍保留在本机，请在服务恢复后重试。"
        actionLabel="重新连接"
        onAction={() => void restore()}
      />
    );
  }
  if (status !== "authenticated") {
    return <StatePanel kind="loading" title="正在前往登录" />;
  }
  return <Fragment key={sessionIdentity.generation}>{children}</Fragment>;
}
