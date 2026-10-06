"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { authClient } from "@/platform/auth/client";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

type ResetState = "ready" | "submitting" | "success" | "invalid" | "error";

export default function ResetPasswordPage() {
  const initialized = useRef(false);
  const token = useRef<string | null>(null);

  const [state, setState] = useState<ResetState>("ready");
  const [tokenChecked, setTokenChecked] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (initialized.current) {
      return;
    }

    initialized.current = true;

    function initializeReset() {
      const fragment = new URLSearchParams(window.location.hash.slice(1));

      token.current = fragment.get("token");

      /*
       * Keep the bearer token out of the address bar/history after the page has
       * captured it. The token remains only in component memory until
       * submitted.
       */
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );

      if (!token.current) {
        setState("invalid");
      }

      setTokenChecked(true);
    }

    queueMicrotask(initializeReset);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setValidationMessage(null);

    if (!token.current) {
      setState("invalid");
      return;
    }

    if (
      password.length < MIN_PASSWORD_LENGTH ||
      password.length > MAX_PASSWORD_LENGTH
    ) {
      setValidationMessage(
        `Use between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
      );
      return;
    }

    if (password !== passwordConfirmation) {
      setValidationMessage("The passwords do not match.");
      return;
    }

    setState("submitting");

    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token: token.current,
      });

      if (error) {
        setState("invalid");
        return;
      }

      token.current = null;
      setPassword("");
      setPasswordConfirmation("");
      setState("success");
    } catch {
      setState("error");
    }
  }

  if (!tokenChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <section
          className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-violet-700 dark:text-violet-300">
            Password recovery
          </p>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Preparing password reset
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Please wait while we prepare the secure reset form.
          </p>
        </section>
      </main>
    );
  }

  if (state === "success") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <section
          className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-violet-700 dark:text-violet-300">
            Password recovery
          </p>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Password updated
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Your password has been changed and existing sessions have been
            revoked. Return to the application and sign in again with your new
            password.
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-zinc-900 bg-violet-200 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 dark:border-violet-100"
          >
            Return to application
          </Link>
        </section>
      </main>
    );
  }

  if (state === "invalid" || state === "error") {
    const isInvalid = state === "invalid";

    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <section
          className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-violet-700 dark:text-violet-300">
            Password recovery
          </p>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {isInvalid
              ? "Reset link unavailable"
              : "We couldn't reset your password"}
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {isInvalid
              ? "This password-reset link is missing, invalid, or expired. Request a new reset email and try again."
              : "A temporary problem prevented the password change. Open the reset link from your email again and retry."}
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Return to application
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
        <p className="text-sm font-medium text-violet-700 dark:text-violet-300">
          Password recovery
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Choose a new password
        </h1>

        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Use a long password or passphrase. Password-manager autofill and
          pasted passwords are supported.
        </p>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium">
              New password
            </label>

            <input
              id="new-password"
              name="new-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              required
              aria-describedby="password-guidance"
              className="mt-2 min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-base outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-violet-400 dark:focus:ring-violet-950"
            />

            <p
              id="password-guidance"
              className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
            >
              {MIN_PASSWORD_LENGTH}–{MAX_PASSWORD_LENGTH} characters. No
              arbitrary composition rules are required.
            </p>
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-sm font-medium"
            >
              Confirm new password
            </label>

            <input
              id="confirm-password"
              name="confirm-password"
              type={showPassword ? "text" : "password"}
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              required
              className="mt-2 min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-base outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-violet-400 dark:focus:ring-violet-950"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            aria-pressed={showPassword}
            className="text-sm font-medium text-violet-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 dark:text-violet-300"
          >
            {showPassword ? "Hide passwords" : "Show passwords"}
          </button>

          {validationMessage ? (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-950 dark:bg-red-950/40 dark:text-red-200"
            >
              {validationMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={state === "submitting"}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-zinc-900 bg-violet-200 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-100"
          >
            {state === "submitting"
              ? "Updating password..."
              : "Update password"}
          </button>
        </form>
      </section>
    </main>
  );
}
