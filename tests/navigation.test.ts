import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loginHref, requiresAuthentication, safeReturnPath, sessionHref } from "../lib/navigation.ts";

describe("safeReturnPath", () => {
  it("keeps internal return paths", () => {
    assert.equal(
      safeReturnPath("/gallery/00000000-0000-0000-0000-000000000001?tab=guide"),
      "/gallery/00000000-0000-0000-0000-000000000001?tab=guide",
    );
  });

  it("rejects external and protocol-relative redirects", () => {
    assert.equal(safeReturnPath("https://example.test"), "/gallery");
    assert.equal(safeReturnPath("//example.test"), "/gallery");
  });
});

describe("requiresAuthentication", () => {
  it("protects module roots and their nested routes, including query and fragment links", () => {
    for (const root of ["/knowledge", "/studio", "/community", "/assistant", "/me", "/account"]) {
      for (const href of [root, `${root}/`, `${root}/nested`, `${root}?filter=山水#details`]) {
        assert.equal(requiresAuthentication(href), true, href);
      }
    }
  });

  it("protects artwork details while keeping both gallery list URL forms public", () => {
    for (const href of ["/gallery", "/gallery/", "/gallery?keyword=山水", "/gallery/?keyword=山水#results"]) {
      assert.equal(requiresAuthentication(href), false, href);
    }
    for (const href of ["/gallery/painting-1", "/gallery/painting-1?tab=guide#description"]) {
      assert.equal(requiresAuthentication(href), true, href);
    }
  });

  it("does not classify public pages, similar path prefixes or external links as protected", () => {
    for (const href of ["/", "/about", "/login", "/register?next=%2Fstudio", "/knowledgebase", "/studio-tour", "/community-guidelines", "/assistant-info", "/membership", "/accounting", "/gallery-exhibition/painting-1", "https://example.test/knowledge", "//example.test/studio"]) {
      assert.equal(requiresAuthentication(href), false, href);
    }
  });
});

describe("loginHref", () => {
  it("preserves the full intended destination through one query-parameter encoding", () => {
    const returnTo = "/community?paintingId=画作%201&tag=山水#comments";
    const href = loginHref(returnTo);
    assert.equal(href, `/login?next=${encodeURIComponent(returnTo)}`);
    assert.equal(new URL(href, "https://artlive.example").searchParams.get("next"), returnTo);
  });

  it("uses the existing safe fallback for external and missing return destinations", () => {
    for (const returnTo of ["https://example.test/studio", "//example.test/studio", ""]) {
      assert.equal(loginHref(returnTo), "/login?next=%2Fgallery", returnTo);
    }
  });
});

describe("sessionHref", () => {
  it("sends anonymous visitors directly to login for protected destinations", () => {
    for (const href of ["/knowledge", "/studio", "/community", "/assistant", "/me", "/account", "/gallery/painting-1?tab=guide#description"]) {
      assert.equal(sessionHref(href, "anonymous"), `/login?next=${encodeURIComponent(href)}`, href);
    }
  });

  it("does not turn pending or failed session restoration into a sign-out", () => {
    const href = "/assistant?session=existing-session#messages";
    for (const status of ["loading", "error", "authenticated"] as const) {
      assert.equal(sessionHref(href, status), href, status);
    }
  });

  it("preserves public links for every session state", () => {
    for (const status of ["loading", "authenticated", "anonymous", "error"] as const) {
      for (const href of ["/", "/gallery?keyword=山水", "/gallery/", "/about", "/login?next=%2Fstudio", "/register", "https://example.test/knowledge"]) {
        assert.equal(sessionHref(href, status), href, `${status}: ${href}`);
      }
    }
  });
});
