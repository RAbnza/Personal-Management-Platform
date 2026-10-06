"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/platform/auth/client";

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .email("Enter a valid email address."),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

type RecoveryState = "form" | "requested";

export default function ForgotPasswordPage() {
  const [state, setState] = useState<RecoveryState>("form");
  const [requestError, setRequestError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    setRequestError(null);

    try {
      /*
       * Do not provide redirectTo here.
       *
       * The server deliberately constructs its own password-reset URL from the
       * raw Better Auth token and stores that token in the URL fragment rather
       * than a query string.
       */
      await authClient.requestPasswordReset({
        email: values.email,
      });

      /*
       * Always show the same acknowledgement for a completed auth request.
       * Whether an account exists must not be disclosed by this page.
       */
      setState("requested");
    } catch {
      setRequestError(
        "A temporary problem prevented the request. Please try again.",
      );
    }
  }

  if (state === "requested") {
    return (
      <AuthCard
        eyebrow="Password recovery"
        title="Check your email"
        description="If an account matches that email address and reset delivery can be completed, you'll receive a password-reset link."
        footer={
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/auth/sign-in"
              className="font-medium text-link underline-offset-4 hover:underline"
            >
              Return to sign in
            </Link>
          </p>
        }
      >
        <div
          role="status"
          className="rounded-control border border-information bg-information-surface px-4 py-3 text-sm leading-6 text-information"
        >
          For privacy, this page does not confirm whether an account exists for
          the address you entered.
        </div>
      </AuthCard>
    );
  }

  const emailErrorId = errors.email ? "forgot-password-email-error" : undefined;

  return (
    <AuthCard
      eyebrow="Password recovery"
      title="Reset your password"
      description="Enter your email address and we'll start the password-recovery process."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Remembered your password?{" "}
          <Link
            href="/auth/sign-in"
            className="font-medium text-link underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form noValidate className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
        <FormField
          htmlFor="forgot-password-email"
          label="Email address"
          error={errors.email?.message}
          errorId="forgot-password-email-error"
        >
          <Input
            {...register("email")}
            id="forgot-password-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={emailErrorId}
          />
        </FormField>

        {requestError ? (
          <div
            role="alert"
            className="rounded-control border border-danger bg-danger-surface px-3 py-3 text-sm leading-5 text-danger"
          >
            {requestError}
          </div>
        ) : null}

        <Button
          type="submit"
          loading={isSubmitting}
          loadingLabel="Requesting reset…"
          className="w-full"
        >
          Send reset instructions
        </Button>
      </form>
    </AuthCard>
  );
}
