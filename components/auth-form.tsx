"use client";

import { PendingIndicator } from "@/components/loading";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { BrandIcon } from "@/components/icons";
import { useSession } from "@/components/session-provider";
import { api, ApiError, errorMessage } from "@/lib/api";
import { safeReturnPath } from "@/lib/navigation";

type AuthMode = "login" | "register";

export function AuthForm({ mode, nextPath }: { mode: AuthMode; nextPath?: string }) {
  const router = useRouter();
  const { establish } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    const data = new FormData(event.currentTarget);

    try {
      const auth = mode === "login"
        ? await api.login({
            username: String(data.get("username") || "").trim(),
            password: String(data.get("password") || ""),
          })
        : await api.register({
            username: String(data.get("username") || "").trim(),
            password: String(data.get("password") || ""),
            fullName: String(data.get("fullName") || "").trim(),
            email: String(data.get("email") || "").trim(),
          });
      establish(auth);
      router.replace(safeReturnPath(nextPath));
    } catch (caught) {
      setError(errorMessage(caught));
      if (caught instanceof ApiError) setFieldErrors(caught.validationErrors);
    } finally {
      setSubmitting(false);
    }
  };

  const nextQuery = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";

  return (
    <main className="auth-shell">
      <div className="background-orb orb-one" aria-hidden="true" />
      <div className="background-orb orb-two" aria-hidden="true" />
      <Link className="auth-back" href="/">← 返回首页</Link>
      <section className="auth-card glass-panel" aria-labelledby="auth-title">
        <header className="auth-header">
          <span className="about-mark"><BrandIcon width={24} height={24} /></span>
          <h1 id="auth-title">{mode === "login" ? "欢迎回来" : "创建 ArtLIVE 账号"}</h1>
          <p>{mode === "login" ? "使用现有账号继续探索画作" : "注册后即可查看详情、收藏并使用作品导览"}</p>
        </header>

        <nav className="auth-tabs" aria-label="身份入口">
          <Link href={`/login${nextQuery}`} aria-current={mode === "login" ? "page" : undefined}>登录</Link>
          <Link href={`/register${nextQuery}`} aria-current={mode === "register" ? "page" : undefined}>注册</Link>
        </nav>

        <form className="auth-form" onSubmit={submit} noValidate>
          {error ? <div className="form-error" role="alert"><strong>{error}</strong>{Object.values(fieldErrors).map((message) => <span key={message}>{message}</span>)}</div> : null}
          <label>
            <span>用户名</span>
            <input name="username" type="text" autoComplete="username" minLength={mode === "register" ? 4 : undefined} maxLength={50} required disabled={submitting} />
          </label>
          {mode === "register" ? (
            <>
              <label>
                <span>姓名</span>
                <input name="fullName" type="text" autoComplete="name" maxLength={100} required disabled={submitting} />
              </label>
              <label>
                <span>邮箱</span>
                <input name="email" type="email" autoComplete="email" required disabled={submitting} />
              </label>
            </>
          ) : null}
          <label>
            <span>密码</span>
            <input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 6 : undefined} maxLength={100} required disabled={submitting} />
          </label>
          <button className="button button-primary button-wide" type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? <><PendingIndicator /> 正在连接…</> : mode === "login" ? "登录" : "完成注册"}
          </button>
        </form>
        <p className="auth-note">登录凭据仅发送给已配置的 Spring Boot API；前端不会保存密码或角色。</p>
      </section>
    </main>
  );
}
