import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "min-h-11 w-full rounded-control border border-input",
          "bg-surface px-3 py-2 text-base text-foreground",
          "placeholder:text-muted-foreground",
          "transition-colors duration-(--motion-duration-fast) ease-state",
          "hover:border-ring",
          "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-disabled-foreground",
          "aria-invalid:border-danger",
          "motion-reduce:transition-none",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
