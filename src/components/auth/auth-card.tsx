import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";

import { ThemeSelect } from "@/components/theme/theme-select";

export interface AuthCardProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({
  eyebrow,
  title,
  description,
  children,
  footer,
}: AuthCardProps) {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 ml-auto w-full max-w-40">
          <ThemeSelect />
        </div>

        <section
          aria-labelledby="auth-page-title"
          className="rounded-card border border-border bg-card p-5 text-card-foreground sm:p-7"
        >
          <div className="flex size-11 items-center justify-center rounded-control bg-accent text-accent-foreground">
            <LockKeyhole
              aria-hidden="true"
              className="size-5"
              strokeWidth={1.9}
            />
          </div>

          <p className="mt-5 text-sm font-medium text-link">{eyebrow}</p>

          <h1
            id="auth-page-title"
            className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-foreground"
          >
            {title}
          </h1>

          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {description}
          </p>

          <div className="mt-7">{children}</div>

          {footer ? (
            <footer className="mt-6 border-t border-border pt-5">
              {footer}
            </footer>
          ) : null}
        </section>
      </div>
    </main>
  );
}
