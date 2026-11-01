export function safeReturnPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/gallery";
  return value;
}

const PROTECTED_ROUTES = ["/knowledge", "/studio", "/community", "/assistant", "/me", "/account"];

export function requiresAuthentication(href: string): boolean {
  const pathname = href.split(/[?#]/, 1)[0];
  return PROTECTED_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))
    || (pathname.startsWith("/gallery/") && pathname.length > "/gallery/".length);
}

export function loginHref(returnTo: string): string {
  return `/login?next=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

export function sessionHref(href: string, status: "loading" | "authenticated" | "anonymous" | "error"): string {
  return status === "anonymous" && requiresAuthentication(href) ? loginHref(href) : href;
}
