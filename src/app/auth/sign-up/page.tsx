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

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

const signUpSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name."),
    email: z
      .string()
      .trim()
      .min(1, "Enter your email address.")
      .email("Enter a valid email address."),
    password: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      )
      .max(
        MAX_PASSWORD_LENGTH,
        `Use no more than ${MAX_PASSWORD_LENGTH} characters.`,
      ),
    passwordConfirmation: z.string().min(1, "Confirm your password."),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "The passwords do not match.",
  });

type SignUpValues = z.infer<typeof signUpSchema>;

type SignUpState = "form" | "verification_pending";

const SIGN_UP_ERROR_MESSAGE =
  "We couldn't complete registration right now. Check your details and try again.";

export default function SignUpPage() {
  const [state, setState] = useState<SignUpState>("form");
  const [registrationError, setRegistrationError] = useState<string | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      passwordConfirmation: "",
    },
  });

  async function onSubmit(values: SignUpValues) {
    setRegistrationError(null);

    try {
      const { error } = await authClient.signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
      });

      if (error) {
        setRegistrationError(SIGN_UP_ERROR_MESSAGE);
        return;
      }

      reset();
      setState("verification_pending");
    } catch {
      setRegistrationError(
        "A temporary problem prevented registration. Please try again.",
      );
    }
  }

  if (state === "verification_pending") {
    return (
      <AuthCard
        eyebrow="Check your email"
        title="Continue from your inbox"
        description="If registration can continue for that email address, you'll receive a verification message with the next step."
        footer={
          <p className="text-center text-sm text-muted-foreground">
            Already verified?{" "}
            <Link
              href="/auth/sign-in"
              className="font-medium text-link underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        }
      >
        <div
          role="status"
          className="rounded-control border border-information bg-information-surface px-4 py-3 text-sm leading-6 text-information"
        >
          Open the verification email on this device or another trusted device.
          After verification, return here and sign in with your password.
        </div>
      </AuthCard>
    );
  }

  const nameErrorId = errors.name ? "sign-up-name-error" : undefined;
  const emailErrorId = errors.email ? "sign-up-email-error" : undefined;
  const passwordErrorId = errors.password
    ? "sign-up-password-error"
    : undefined;
  const confirmationErrorId = errors.passwordConfirmation
    ? "sign-up-password-confirmation-error"
    : undefined;

  const passwordDescribedBy = ["sign-up-password-guidance", passwordErrorId]
    .filter(Boolean)
    .join(" ");

  return (
    <AuthCard
      eyebrow="Create your workspace"
      title="Create an account"
      description="Use your own account to keep your personal workspace private and separate from every other user's data."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
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
          htmlFor="sign-up-name"
          label="Name"
          error={errors.name?.message}
          errorId="sign-up-name-error"
        >
          <Input
            {...register("name")}
            id="sign-up-name"
            type="text"
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={nameErrorId}
          />
        </FormField>

        <FormField
          htmlFor="sign-up-email"
          label="Email address"
          error={errors.email?.message}
          errorId="sign-up-email-error"
        >
          <Input
            {...register("email")}
            id="sign-up-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={emailErrorId}
          />
        </FormField>

        <FormField
          htmlFor="sign-up-password"
          label="Password"
          description={`${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters. Long passphrases and password-manager generated passwords are supported.`}
          descriptionId="sign-up-password-guidance"
          error={errors.password?.message}
          errorId="sign-up-password-error"
        >
          <Input
            {...register("password")}
            id="sign-up-password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={passwordDescribedBy}
          />
        </FormField>

        <FormField
          htmlFor="sign-up-password-confirmation"
          label="Confirm password"
          error={errors.passwordConfirmation?.message}
          errorId="sign-up-password-confirmation-error"
        >
          <Input
            {...register("passwordConfirmation")}
            id="sign-up-password-confirmation"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            aria-invalid={Boolean(errors.passwordConfirmation)}
            aria-describedby={confirmationErrorId}
          />
        </FormField>

        {registrationError ? (
          <div
            role="alert"
            className="rounded-control border border-danger bg-danger-surface px-3 py-3 text-sm leading-5 text-danger"
          >
            {registrationError}
          </div>
        ) : null}

        <Button
          type="submit"
          loading={isSubmitting}
          loadingLabel="Creating account…"
          className="w-full"
        >
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
