"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { useSession } from "@/components/session-provider";
import { sessionHref } from "@/lib/navigation";

type SessionLinkProps = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

/** Resolve the real destination before navigation, including new-tab links. */
export function SessionLink({ href, prefetch = false, ...props }: SessionLinkProps) {
  const { status } = useSession();
  return <Link {...props} href={sessionHref(href, status)} prefetch={prefetch} />;
}
