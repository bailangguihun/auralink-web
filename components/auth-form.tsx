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
  const [confirmationInvalid, setConfirmationInvalid] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setFieldErrors({});
    setConfirmationInvalid(false);
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") || "");

    if (mode === "register") {
      const confirmation = String(data.get("confirmPassword") || "");
      if (!confirmation || password !== confirmation) {
        setError(confirmation ? "两次输入的密码不一致，请重新确认。" : "请再次输入密码。");
        setConfirmationInvalid(true);
        (form.elements.namedItem("confirmPassword") as HTMLInputElement | null)?.focus();
        return;
      }
    }

    setSubmitting(true);

    try {
      const auth = mode === "login"
        ? await api.login({
            username: String(data.get("username") || "").trim(),
            password,
          })
        : await api.register({
            username: String(data.get("username") || "").trim(),
            password,
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
      <Link className="auth-back" href="/" prefetch={false}>← 返回首页</Link>
      <section className="auth-card glass-panel" aria-labelledby="auth-title">
        <header className="auth-header">
          <span className="about-mark"><BrandIcon width={24} height={24} /></span>
          <h1 id="auth-title">{mode === "login" ? "欢迎回来" : "创建 ArtLIVE 账号"}</h1>
        </header>

        <nav className="auth-tabs" aria-label="身份入口">
          <Link href={`/login${nextQuery}`} prefetch={false} aria-current={mode === "login" ? "page" : undefined}>登录</Link>
          <Link href={`/register${nextQuery}`} prefetch={false} aria-current={mode === "register" ? "page" : undefined}>注册</Link>
        </nav>

        <form className="auth-form" onSubmit={submit} noValidate>
          {error ? <div id="auth-form-error" className="form-error" role="alert"><strong>{error}</strong>{Object.values(fieldErrors).map((message) => <span key={message}>{message}</span>)}</div> : null}
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
          <label className="auth-password-field">
            <span id="auth-password-label">密码</span>
            <input name="password" type="password" aria-labelledby="auth-password-label" aria-describedby={mode === "register" ? "auth-password-hint" : undefined} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 6 : undefined} maxLength={100} required disabled={submitting} />
            {mode === "register" ? <small id="auth-password-hint" className="auth-password-hint">密码至少 6 个字符</small> : null}
          </label>
          {mode === "register" ? (
            <label>
              <span>确认密码</span>
              <input name="confirmPassword" type="password" autoComplete="new-password" minLength={6} maxLength={100} required disabled={submitting} aria-invalid={confirmationInvalid || undefined} aria-describedby={confirmationInvalid ? "auth-form-error" : undefined} />
            </label>
          ) : null}
          <button className="button button-primary button-wide" type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? <><PendingIndicator /> 正在连接…</> : mode === "login" ? "登录" : "完成注册"}
          </button>
        </form>
      </section>
    </main>
  );
}
