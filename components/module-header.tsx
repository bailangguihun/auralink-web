import type { ReactNode } from "react";

import { MODULE_HEADINGS } from "@/lib/module-headings";

/** Opt-in page heading; assistant and immersive pages keep their own layouts. */
export function ModuleHeader({ module, children }: {
  module: keyof typeof MODULE_HEADINGS;
  children?: ReactNode;
}) {
  const { title, subtitle } = MODULE_HEADINGS[module];
  return <header className="module-header glass-panel">
    <div className="module-header-copy">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
    {children ? <div className="module-header-meta">{children}</div> : null}
  </header>;
}
