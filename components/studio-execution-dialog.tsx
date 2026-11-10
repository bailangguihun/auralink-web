"use client";

import { useEffect, useId, useRef, useState } from "react";

import styles from "./studio-execution-dialog.module.css";

type Props = {
  onConfirm: (name: string) => void;
  onCancel: () => void;
};

export function StudioExecutionDialog({ onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const composing = useRef(false);
  const [name, setName] = useState("");
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const trimmedName = name.trim();
  const invalidCharacters = /[\u0000-\u001f\u007f-\u009f]/u.test(name);
  const validName = Boolean(trimmedName) && trimmedName.length <= 120 && !invalidCharacters;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const page = window.location.pathname + window.location.search;
    const html = document.documentElement;
    const body = document.body;
    const htmlStyle = html.style;
    const bodyStyle = body.style;
    const htmlBefore = html.getAttribute("style");
    const bodyBefore = body.getAttribute("style");
    const restore = (element: HTMLElement, value: string | null) => {
      if (value === null) element.removeAttribute("style");
      else element.setAttribute("style", value);
    };

    // Fixed positioning also prevents the underlying page from scrolling on iOS.
    htmlStyle.setProperty("overflow", "hidden");
    bodyStyle.setProperty("overflow", "hidden");
    bodyStyle.setProperty("position", "fixed");
    bodyStyle.setProperty("top", `${-scrollY}px`);
    bodyStyle.setProperty("left", `${-scrollX}px`);
    bodyStyle.setProperty("right", "0");
    bodyStyle.setProperty("width", "100%");

    const viewport = window.visualViewport;
    let resizeFrame = 0;
    const syncViewport = () => {
      // Keep browser zoom available; only compensate for browser chrome/keyboard.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      dialog.style.setProperty("--dialog-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      dialog.style.setProperty("--dialog-viewport-top", `${viewport?.offsetTop ?? 0}px`);
    };
    const onResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(syncViewport);
    };
    syncViewport();
    dialog.showModal();
    viewport?.addEventListener("resize", onResize);
    viewport?.addEventListener("scroll", onResize);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(resizeFrame);
      viewport?.removeEventListener("resize", onResize);
      viewport?.removeEventListener("scroll", onResize);
      window.removeEventListener("resize", onResize);
      dialog.close();
      restore(body, bodyBefore);
      restore(html, htmlBefore);
      htmlStyle.setProperty("scroll-behavior", "auto");
      if (window.location.pathname + window.location.search === page) window.scrollTo(scrollX, scrollY);
      restore(html, htmlBefore);
      if (priorFocus?.isConnected) priorFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); onCancel(); }}
      onKeyDown={event => {
        if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input:not(:disabled), button:not(:disabled)")]
          .filter(control => control.tabIndex >= 0 && control.getClientRects().length > 0 && getComputedStyle(control).visibility === "visible");
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last) return;
        const active = document.activeElement;
        const outsideControls = !controls.some(control => control === active);
        if (event.shiftKey && (active === first || outsideControls)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || outsideControls)) {
          event.preventDefault();
          first.focus();
        }
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onCancel();
      }}
    >
      <form onSubmit={event => {
        event.preventDefault();
        if (validName && !composing.current) onConfirm(trimmedName);
      }}>
        <header className={styles.header}>
          <h2 id={titleId}>为本次创作命名</h2>
          <p id={descriptionId}>名称会显示在「我的作品」中。</p>
        </header>
        <label className={styles.field}>
          <span>本次名称</span>
          <input
            autoFocus
            value={name}
            maxLength={120}
            placeholder="例如：秋山听雨"
            autoComplete="off"
            aria-invalid={invalidCharacters || undefined}
            aria-describedby={invalidCharacters ? errorId : undefined}
            onChange={event => setName(event.target.value)}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={() => { composing.current = false; }}
            onKeyDown={event => {
              if (event.key === "Enter" && (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
            }}
          />
        </label>
        {invalidCharacters ? <p id={errorId} className={styles.error} role="alert">名称不能包含控制字符。</p> : null}
        <footer className={styles.actions}>
          <button className="button button-quiet" type="button" onClick={onCancel}>取消</button>
          <button className="button button-primary" type="submit" disabled={!validName}>开始执行</button>
        </footer>
      </form>
    </dialog>
  );
}
