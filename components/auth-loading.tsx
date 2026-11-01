import { BrandIcon } from "@/components/icons";

/** Match the destination form while route parameters load; never submit without next. */
export function AuthLoading({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  const fields = register ? ["用户名", "姓名", "邮箱", "密码", "确认密码"] : ["用户名", "密码"];

  return (
    <main className="auth-shell" aria-busy="true" aria-label={register ? "正在打开注册" : "正在打开登录"}>
      <div className="background-orb orb-one" aria-hidden="true" />
      <div className="background-orb orb-two" aria-hidden="true" />
      <span className="auth-back">← 返回首页</span>
      <section className="auth-card glass-panel" aria-labelledby="auth-loading-title">
        <header className="auth-header">
          <span className="about-mark"><BrandIcon width={24} height={24} /></span>
          <h1 id="auth-loading-title">{register ? "创建 ArtLIVE 账号" : "欢迎回来"}</h1>
        </header>
        <nav className="auth-tabs" aria-label="身份入口">
          <a aria-disabled="true" aria-current={!register ? "page" : undefined}>登录</a>
          <a aria-disabled="true" aria-current={register ? "page" : undefined}>注册</a>
        </nav>
        <div className="auth-form">
          {fields.map(label => (
            <label key={label} className={label === "密码" ? "auth-password-field" : undefined}>
              <span>{label}</span>
              <input disabled aria-label={label} type={label.includes("密码") ? "password" : "text"} />
              {register && label === "密码" ? <small className="auth-password-hint">密码至少 6 个字符</small> : null}
            </label>
          ))}
          <button className="button button-primary button-wide" type="button" disabled>{register ? "完成注册" : "登录"}</button>
        </div>
      </section>
    </main>
  );
}
