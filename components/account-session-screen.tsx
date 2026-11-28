"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useSession } from "@/components/session-provider";
import { formatProfileDate } from "@/lib/profile-contract";

/**
 * Provider-free authenticated destination used to establish the basic session
 * contract.  It deliberately renders only the profile restored by
 * SessionProvider; favorites, Guide, Studio and creation APIs stay out of the
 * authentication foundation.
 */
export function AccountSessionScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();

  const logout = () => {
    signOut();
    router.replace("/");
  };

  if (!user) return null;

  return (
    <section className="profile-panel glass-panel" aria-labelledby="account-title">
      <div className="section-heading section-heading-left">
        <h1 id="account-title">账号</h1>
        <p>以下资料由当前登录会话恢复，不会请求收藏、导览或创作服务。</p>
      </div>
      <dl className="profile-facts">
        <div><dt>用户名</dt><dd>{user.username}</dd></div>
        <div><dt>姓名</dt><dd>{user.fullName || "未填写"}</dd></div>
        <div><dt>邮箱</dt><dd>{user.email || "加载后可见"}</dd></div>
        {user.createdAt ? <div><dt>注册时间</dt><dd>{formatProfileDate(user.createdAt)}</dd></div> : null}
      </dl>
      <div className="detail-actions">
        <Link className="button" href="/me" prefetch={false}>我的收藏</Link>
        <button className="button" type="button" onClick={logout}>退出登录</button>
      </div>
    </section>
  );
}
