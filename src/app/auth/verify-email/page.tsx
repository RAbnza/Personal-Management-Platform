"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type VerificationState = "verifying" | "verified" | "invalid" | "error";

const verificationContent: Record<
  VerificationState,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  verifying: {
    eyebrow: "Email verification",
    title: "Verifying your email",
    description: "Please wait while we confirm your email address.",
  },
  verified: {
    eyebrow: "Email verification",
    title: "Email verified",
    description:
      "Your email address has been confirmed. You can now return to the application and sign in.",
  },
  invalid: {
    eyebrow: "Email verification",
    title: "Verification link unavailable",
    description:
      "This verification link is missing, invalid, or expired. Request a new verification email and try again.",
  },
  error: {
    eyebrow: "Email verification",
    title: "We couldn't verify your email",
    description:
      "A temporary problem prevented verification. Open the verification link from your email again and retry.",
  },
};

export default function VerifyEmailPage() {
  const verificationStarted = useRef(false);
  const [state, setState] = useState<VerificationState>("verifying");

  useEffect(() => {
    /*
     * React Strict Mode can run effects more than once during development.
     * A verification token must only be submitted once from this page load.
     */
    if (verificationStarted.current) {
      return;
    }

    verificationStarted.current = true;

    async function verifyEmail() {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const token = fragment.get("token");

      /*
       * Remove the bearer token from the address bar and browser history entry
       * immediately after reading it. It remains only in this function's
       * memory until verification completes.
       */
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );

      if (!token) {
        setState("invalid");
        return;
      }

      try {
        const response = await fetch("/api/auth/verify-email-token", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
          }),
          cache: "no-store",
        });

        if (response.ok) {
          setState("verified");
          return;
        }

        if (response.status >= 500) {
          setState("error");
          return;
        }

        setState("invalid");
      } catch {
        setState("error");
      }
    }

    void verifyEmail();
  }, []);

  const content = verificationContent[state];

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <section
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8"
        aria-live="polite"
      >
        <p className="text-sm font-medium text-violet-700 dark:text-violet-300">
          {content.eyebrow}
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {content.title}
        </h1>

        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {content.description}
        </p>

        {state === "verifying" ? (
          <div
            className="mt-6 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
            aria-hidden="true"
          >
            <div className="h-full w-2/3 animate-pulse rounded-full bg-violet-300 dark:bg-violet-400" />
          </div>
        ) : (
          <Link
            href="/"
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-zinc-900 bg-violet-200 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 dark:border-violet-100"
          >
            Return to application
          </Link>
        )}
      </section>
    </main>
  );
}
