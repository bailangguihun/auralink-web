"use client";

import { PendingIndicator } from "@/components/loading";
import { useEffect, useState } from "react";

const TOKEN_KEY = "artlive.session.token.v1";
const ALLOWED_DESTINATIONS = new Set(["/knowledge", "/studio"]);
const ALLOWED_BACK_PATHS = new Set([
  "/pages/index/index",
  "/pages/gallery/gallery",
  "/pages/knowledge/knowledge",
  "/pages/assistant/assistant",
  "/pages/account/account",
]);

export default function MobileAuthPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = fragment.get("token")?.trim() ?? "";
    const requestedDestination = fragment.get("next") ?? "";
    const requestedBackPath = fragment.get("back") ?? "";

    // Remove the credential-bearing fragment before any further navigation.
    window.history.replaceState(null, "", "/mobile-auth");

    if (!token || token.length > 4096) {
      setError("未收到有效的小程序登录凭据，请返回小程序后重试。");
      return;
    }
    if (!ALLOWED_DESTINATIONS.has(requestedDestination)) {
      setError("目标页面无效，请返回小程序后重试。");
      return;
    }

    window.localStorage.setItem(TOKEN_KEY, token);
    const backPath = ALLOWED_BACK_PATHS.has(requestedBackPath)
      ? requestedBackPath
      : "/pages/index/index";
    const query = new URLSearchParams({ source: "miniapp", back: backPath });
    window.location.replace(`${requestedDestination}?${query.toString()}`);
  }, []);

  return (
    <main className="page-shell availability-page">
      <section className="read-pending glass-panel">
        {!error ? <PendingIndicator /> : null}
        <div>
          <h1 role={error ? "alert" : "status"}>{error ? "无法同步登录状态" : "正在同步小程序登录状态"}</h1>
          <p>{error ?? "即将进入 ArtLIVE 功能页面，无需再次输入账号密码。"}</p>
        </div>
      </section>
    </main>
  );
}

