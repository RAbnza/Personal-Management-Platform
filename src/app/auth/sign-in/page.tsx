"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/platform/auth/client";

const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type SignInValues = z.infer<typeof signInSchema>;

const SIGN_IN_ERROR_MESSAGE =
  "We couldn't sign you in with those credentials. If your email still needs verification, check your inbox for the verification message.";

export default function SignInPage() {
  const router = useRouter();

  const [authenticationError, setAuthenticationError] = useState<string | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: SignInValues) {
    setAuthenticationError(null);

    try {
      const { error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });

      if (error) {
        setAuthenticationError(SIGN_IN_ERROR_MESSAGE);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setAuthenticationError(
        "A temporary problem prevented sign-in. Please try again.",
      );
    }
  }

  const emailErrorId = errors.email ? "sign-in-email-error" : undefined;
  const passwordErrorId = errors.password
    ? "sign-in-password-error"
    : undefined;

  return (
    <AuthCard
      eyebrow="Welcome back"
      title="Sign in"
      description="Sign in to access your private personal workspace."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Need an account?{" "}
          <Link
            href="/auth/sign-up"
            className="font-medium text-link underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </p>
      }
    >
      <form noValidate className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
        <FormField
          htmlFor="sign-in-email"
          label="Email address"
          error={errors.email?.message}
          errorId="sign-in-email-error"
        >
          <Input
            {...register("email")}
            id="sign-in-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={emailErrorId}
          />
        </FormField>

        <FormField
          htmlFor="sign-in-password"
          label="Password"
          error={errors.password?.message}
          errorId="sign-in-password-error"
        >
          <Input
            {...register("password")}
            id="sign-in-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={passwordErrorId}
          />
        </FormField>

        <div className="flex justify-end">
          <Link
            href="/auth/forgot-password"
            className="text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {authenticationError ? (
          <div
            role="alert"
            className="rounded-control border border-danger bg-danger-surface px-3 py-3 text-sm leading-5 text-danger"
          >
            {authenticationError}
          </div>
        ) : null}

        <Button
          type="submit"
          loading={isSubmitting}
          loadingLabel="Signing in…"
          className="w-full"
        >
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
