"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowIcon } from "@/components/icons";

// Most pages scroll the document. The assistant explicitly marks its primary
// reading area; tables, pickers, and modal scrollbars do not become page targets.
const scrollArea = () => document.querySelector<HTMLElement>("[data-page-scroll]");

export function BackToTop() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [clearance, setClearance] = useState(0);
  const animation = useRef(0);
  const cancel = () => { cancelAnimationFrame(animation.current); animation.current = 0; };

  useEffect(() => {
    let frame = 0;
    let observedArea: HTMLElement | null = null;
    const measure = () => {
      frame = 0;
      const area = scrollArea();
      if (area !== observedArea) {
        observer?.disconnect();
        if (area) observer?.observe(area);
        observedArea = area;
      }
      const top = area ? area.scrollTop : window.scrollY;
      const height = area ? area.clientHeight : window.innerHeight;
      setVisible(top > Math.max(320, height * .8));
      setClearance(area ? Math.max(0, window.innerHeight - area.getBoundingClientRect().bottom + 24) : 0);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    // Conversation branches mount asynchronously; bind to the current reading
    // area and keep the button above a growing composer without watching text.
    const mounts = pathname.startsWith("/assistant") ? new MutationObserver(() => {
      if (scrollArea() !== observedArea) schedule();
    }) : null;
    mounts?.observe(document.body, { childList: true, subtree: true });
    const stopForKey = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Escape"].includes(event.key)) cancel();
    };
    measure();
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("pointerdown", cancel, { passive: true });
    window.addEventListener("keydown", stopForKey);
    return () => {
      cancel(); cancelAnimationFrame(frame);
      observer?.disconnect(); mounts?.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("pointerdown", cancel);
      window.removeEventListener("keydown", stopForKey);
    };
  }, [pathname]);

  const goToTop = () => {
    cancel();
    const area = scrollArea();
    const start = area ? area.scrollTop : window.scrollY;
    const move = (top: number) => (area || window).scrollTo({ top, behavior: "instant" });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { move(0); return; }
    const began = performance.now();
    const step = (time: number) => {
      const progress = Math.min(1, (time - began) / 360);
      const top = start * (1 - progress) ** 3;
      const finished = progress === 1 || top < 1;
      move(finished ? 0 : top);
      animation.current = finished ? 0 : requestAnimationFrame(step);
    };
    animation.current = requestAnimationFrame(step);
  };

  if (!visible) return null;
  return <button type="button" className="back-to-top" aria-label="返回顶部" title="返回顶部" onClick={goToTop}
    style={{ "--back-to-top-clearance": `${clearance}px` } as CSSProperties}>
    <ArrowIcon direction="up" width={23} height={23} />
  </button>;
}
