"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "success" | "danger" | "ghost";
type Size = "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-white",
  success: "bg-accent-2 text-ink",
  danger: "bg-danger text-white",
  ghost: "bg-bg text-ink",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "lg", fullWidth, className = "", children, ...rest },
  ref
) {
  const minH = size === "lg" ? "min-h-[56px]" : "min-h-[44px]";
  const padding = size === "lg" ? "px-6 py-3" : "px-4 py-2";
  return (
    <button
      ref={ref}
      className={[
        "inline-flex items-center justify-center gap-2",
        "nb-border nb-shadow nb-pressable nb-focus",
        "rounded-[var(--radius)] font-semibold",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0",
        minH,
        padding,
        fullWidth ? "w-full" : "",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
});
