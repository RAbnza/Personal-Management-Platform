import { Button, type ButtonProps } from "./button";
import { cn } from "@/lib/cn";

export function IconButton({
  label,
  className,
  children,
  ...props
}: Omit<ButtonProps, "aria-label" | "loadingLabel"> & { label: string }) {
  return (
    <Button
      {...props}
      aria-label={label}
      loadingLabel="…"
      className={cn("size-11 shrink-0 p-2.5", className)}
    >
      <span aria-hidden="true">{children}</span>
    </Button>
  );
}
