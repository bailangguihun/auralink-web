"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandIcon, CloseIcon, MenuIcon, UserIcon } from "@/components/icons";
import { PendingIndicator } from "@/components/loading";
import { useSession } from "@/components/session-provider";
import { useNavigationPrefetch } from "@/components/use-navigation-prefetch";

const links = [
  ["/", "首页"],
  ["/gallery", "画廊"],
  ["/knowledge", "知识库"],
  ["/studio", "工坊"],
  ["/community", "社区"],
  ["/assistant", "助手"],
  ["/about", "关于"],
] as const;

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { status, user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const prefetch = useNavigationPrefetch(pathname);

  useEffect(() => setOpen(false), [pathname]);

  const logout = () => {
    signOut();
    router.push("/");
  };

  return (
    <header className={`topbar${pathname === "/" ? " topbar-home" : ""}`}>
      <Link className="brand" href={pathname === "/" ? "/#home-welcome" : "/"} prefetch={false} aria-label="ArtLIVE 画智体首页" onClick={() => setOpen(false)}>
        <span className="brand-mark"><BrandIcon /></span>
        <span>ArtLIVE <b>画智体</b></span>
      </Link>

      <button
        className="nav-toggle"
        type="button"
        aria-label={open ? "关闭导航" : "打开导航"}
        aria-expanded={open}
        aria-controls="primary-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>

      <nav id="primary-navigation" className={`primary-nav${open ? " nav-open" : ""}`} aria-label="主导航">
        {links.map(([href, label]) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return <Link key={href} href={href === "/" && pathname === "/" ? "/#home-welcome" : href} prefetch={false} aria-current={active ? "page" : undefined}
            onClick={() => setOpen(false)}
            onPointerEnter={event => { if (event.pointerType === "mouse") prefetch.prepare(href); }}
            onFocus={() => prefetch.prepare(href)}>{label}</Link>;
        })}
      </nav>

      <div className="session-actions">
        {status === "loading" ? <span className="session-restoring" role="status"><PendingIndicator />确认账号</span> : status === "authenticated" ? (
          <>
            <Link className="user-link" href="/account" prefetch={false} title="账号">
              <UserIcon />
              <span>{user?.fullName || user?.username || "我的"}</span>
            </Link>
            <Link className="text-button" href="/me" prefetch={false}>我的收藏</Link>
            <button className="text-button" type="button" onClick={logout}>退出</button>
          </>
        ) : (
          <Link className="user-link" href="/login" prefetch={false} title="登录或注册"><UserIcon /><span>登录</span></Link>
        )}
      </div>
    </header>
  );
}
