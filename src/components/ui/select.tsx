import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Native selection keeps platform keyboard, touch and assistive behavior. */
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    data-ui-control="select"
    ref={ref}
    className={cn(
      "min-h-11 w-full max-w-full min-w-0 rounded-control border border-input bg-surface px-3 py-2 text-base text-foreground hover:border-ring disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-disabled-foreground aria-invalid:border-danger",
      className,
    )}
    {...props}
  />
));
Select.displayName = "Select";
