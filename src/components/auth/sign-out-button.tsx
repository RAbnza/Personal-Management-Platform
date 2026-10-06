"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/platform/auth/client";

export interface SignOutButtonProps {
  className?: string | undefined;
}

export function SignOutButton({ className }: SignOutButtonProps) {
  const router = useRouter();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleSignOut() {
    setSignOutError(null);
    setIsSigningOut(true);

    try {
      const { error } = await authClient.signOut();

      if (error) {
        setSignOutError(
          "We couldn't sign you out right now. Please try again.",
        );
        return;
      }

      router.replace("/auth/sign-in");
      router.refresh();
    } catch {
      setSignOutError(
        "A temporary problem prevented sign-out. Please try again.",
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="ghost"
        loading={isSigningOut}
        loadingLabel="Signing out…"
        onClick={handleSignOut}
        className="w-full justify-start"
      >
        <LogOut aria-hidden="true" className="size-4" strokeWidth={1.9} />

        <span>Sign out</span>
      </Button>

      {signOutError ? (
        <p role="alert" className="mt-2 text-xs leading-5 text-danger">
          {signOutError}
        </p>
      ) : null}
    </div>
  );
}
