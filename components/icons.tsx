import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function BrandIcon(props: IconProps) {
  return <svg {...base} {...props}><circle cx="17" cy="5" r="2" /><path d="M3 20 8 12l4 4 5-9 5 6" /></svg>;
}

export function SearchIcon(props: IconProps) {
  return <svg {...base} {...props}><circle cx="11" cy="11" r="7.5" /><path d="m20 20-3.8-3.8" /></svg>;
}

export function UserIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}

export function HeartIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return <svg {...base} {...props} fill={filled ? "currentColor" : "none"}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" /></svg>;
}

export function ArrowIcon({ direction = "right", ...props }: IconProps & { direction?: "left" | "right" | "down" | "up" }) {
  const transform = direction === "left" ? "rotate(180 12 12)" : direction === "down" ? "rotate(90 12 12)" : direction === "up" ? "rotate(-90 12 12)" : undefined;
  return <svg {...base} {...props}><g transform={transform}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></g></svg>;
}

export function MenuIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
}

export function CloseIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="m6 6 12 12M18 6 6 18" /></svg>;
}
