export const NAVIGATION_ROUTES = [
  "/",
  "/gallery",
  "/knowledge",
  "/studio",
  "/community",
  "/assistant",
  "/about",
] as const;

/** Warm client code only. Importing a screen does not mount it or start its effects. */
export async function preloadNavigationModule(href: string): Promise<void> {
  switch (href) {
    case "/":
      await Promise.all([
        import("@/components/home-hero"),
        import("@/components/home-screens"),
      ]);
      break;
    case "/gallery":
      await import("@/components/gallery-screen");
      break;
    case "/knowledge":
      await import("@/components/knowledge-screen");
      await import("@/components/knowledge-charts");
      break;
    case "/studio":
      await import("@/components/studio-screen");
      break;
    case "/community":
      await import("@/components/community/community-screen");
      break;
    case "/assistant":
      await import("@/components/assistant/assistant-screen");
      break;
    case "/login":
    case "/register":
      await import("@/components/auth-form");
      break;
    case "/me":
      await import("@/components/me-screen");
      break;
    case "/account":
      await import("@/components/account-session-screen");
      break;
    // The about page has no dedicated client module to prepare.
    case "/about":
    default:
      break;
  }
}
