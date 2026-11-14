"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { startPresentation } from "@/lib/content-presentation";

/** Changing entryKey hides this result in the commit before it can paint.
 * Children stay mounted: input state, cached tabs and request ownership survive. */
export function ContentReveal({ entryKey, ready = true, children, label, className = "" }: {
  entryKey: string; ready?: boolean; children: ReactNode; label: string; className?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const available = useRef(ready); available.current = ready;
  const [failed, setFailed] = useState<string | null>(null);
  useLayoutEffect(() => {
    const root = element.current;
    if (!root) return;
    root.hidden = false; setFailed(null);
    const presentation = startPresentation(root, { ready: () => available.current, onTimeout: () => setFailed(entryKey) });
    return presentation.cancel;
  }, [entryKey]);
  return <>
    <div ref={element} className={`content-reveal-region ${className}`} data-content-key={entryKey} data-content-label={label}
      data-content-phase="preparing" data-content-ready="false">{children}</div>
    {failed === entryKey ? <div className="state-panel state-error" role="alert"><div><h3>{label}暂未准备完成</h3><p>请重新筛选或切换模块后重试。</p></div></div> : null}
  </>;
}
