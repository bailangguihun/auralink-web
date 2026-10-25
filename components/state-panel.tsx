"use client";

import Link from "next/link";
import { LoadingStatus } from "@/components/loading";

type StateKind = "loading" | "empty" | "error" | "unavailable" | "pending";

type StatePanelProps = {
  kind: StateKind;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  compact?: boolean;
};

const symbols: Record<StateKind, string> = {
  loading: "墨",
  empty: "空",
  error: "！",
  unavailable: "候",
  pending: "启",
};

export function StatePanel({
  kind,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  compact = false,
}: StatePanelProps) {
  if (kind === "loading") return <div className="read-pending"><LoadingStatus label={title} onRetry={onAction} />{description ? <p>{description}</p> : null}</div>;
  return (
    <section className={`state-panel state-${kind}${compact ? " state-compact" : ""}`} aria-live="polite">
      <span className="state-symbol" aria-hidden="true">{symbols[kind]}</span>
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        {actionLabel && actionHref ? (
          <Link className="button button-primary" href={actionHref}>{actionLabel}</Link>
        ) : null}
        {actionLabel && onAction ? (
          <button className="button button-primary" type="button" onClick={onAction}>{actionLabel}</button>
        ) : null}
      </div>
    </section>
  );
}
