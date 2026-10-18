import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  [
    "relative inline-flex min-h-12 items-center justify-center gap-2 sm:min-h-11 pointer-coarse:min-h-12",
    "min-w-0 max-w-full rounded-button border px-[min(1rem,16px)] py-2.5 text-center",
    "text-sm font-semibold",
    "cursor-pointer select-none",
    "transition-shadow",
    "duration-(--motion-duration-fast) ease-state",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-surface-subtle disabled:text-disabled-foreground",
    "disabled:transition-none motion-reduce:transition-none",
  ],
  {
    variants: {
      variant: {
        primary: [
          "border-primary-border bg-primary text-primary-foreground",
          "hover:bg-primary-hover",
          "active:bg-primary-pressed",
        ],
        secondary: [
          "border-input bg-secondary text-secondary-foreground",
          "hover:bg-accent hover:text-accent-foreground",
          "active:bg-muted",
        ],
        ghost: [
          "border-transparent bg-transparent text-foreground",
          "hover:bg-accent hover:text-accent-foreground",
          "active:bg-muted",
        ],
        danger: [
          "border-danger bg-destructive text-destructive-foreground",
          "hover:shadow-level-1",
          "active:shadow-none",
        ],
        link: [
          "border-transparent bg-transparent text-link",
          "underline-offset-4 hover:underline",
        ],
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
);

export interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  loadingLabel?: string;
}

export function Button({
  children,
  className,
  disabled,
  loading = false,
  loadingLabel = "Working…",
  type = "button",
  variant,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      data-ui-control="button"
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    >
      <span
        className={cn(
          "inline-flex min-w-0 items-center justify-center gap-2",
          loading && "invisible",
        )}
        aria-hidden={loading || undefined}
      >
        {children}
      </span>

      {loading ? (
        <span
          className="absolute inset-0 inline-flex items-center justify-center px-4"
          aria-live="polite"
        >
          {loadingLabel}
        </span>
      ) : null}
    </button>
  );
}
