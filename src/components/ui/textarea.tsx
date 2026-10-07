import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-28 w-full resize-y rounded-control border border-input",
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

Textarea.displayName = "Textarea";
