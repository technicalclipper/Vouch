import type { HTMLAttributes, ReactNode } from "react";

interface Props extends HTMLAttributes<HTMLDivElement> {
  hero?: boolean;
  fill?: "white" | "soft" | "bg";
  children: ReactNode;
}

export function Card({
  hero,
  fill = "white",
  className = "",
  children,
  ...rest
}: Props) {
  const fillClass =
    fill === "soft" ? "bg-soft" : fill === "bg" ? "bg-bg" : "bg-surface";
  return (
    <div
      className={[
        "nb-border rounded-[var(--radius-lg)]",
        hero ? "nb-shadow-lg" : "nb-shadow",
        "p-6 sm:p-7",
        fillClass,
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
