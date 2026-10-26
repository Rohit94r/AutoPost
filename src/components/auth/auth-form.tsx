"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up" | "forgot" | "reset";

const COPY: Record<Mode, { title: string; subtitle: string; cta: string }> = {
  "sign-in": { title: "Welcome back", subtitle: "Sign in to your workspace.", cta: "Sign in" },
  "sign-up": { title: "Create your workspace", subtitle: "Free to start. No card required.", cta: "Create account" },
  forgot: { title: "Reset your password", subtitle: "We'll email you a secure reset link.", cta: "Send reset link" },
  reset: { title: "Choose a new password", subtitle: "At least 10 characters.", cta: "Update password" },
};

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function AuthForm({ mode, googleEnabled }: { mode: Mode; googleEnabled?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [done, setDone] = useState<string | null>(null);
  const copy = COPY[mode];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    setLoading(true);
    setError(null);
    try {
      if (mode === "sign-in") {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) throw new Error(error.status === 403 ? "Please verify your email first. Check your inbox." : error.message ?? "Invalid email or password.");
        router.replace(safeNext(params.get("next")));
        router.refresh();
      } else if (mode === "sign-up") {
        const name = String(f.get("name") ?? "").trim();
        const { data, error } = await authClient.signUp.email({ name, email, password, callbackURL: "/onboarding" });
        if (error) throw new Error(error.message ?? "Could not create the account.");
        if (data && "token" in data && data.token) {
          router.replace("/onboarding");
          router.refresh();
        } else setDone("Check your inbox to verify your email, then sign in.");
      } else if (mode === "forgot") {
        const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        if (error) throw new Error(error.message ?? "Could not send the email.");
        setDone("If an account exists for that email, a reset link is on its way.");
      } else {
        const token = params.get("token");
        if (!token) throw new Error("This reset link is invalid. Request a new one.");
        const { error } = await authClient.resetPassword({ newPassword: password, token });
        if (error) throw new Error(error.message ?? "Could not reset the password.");
        setDone("Password updated. You can sign in now.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-strong p-7 sm:p-8">
      <h1 className="font-display text-4xl text-white">{copy.title}</h1>
      <p className="mt-1 text-sm text-fog">{copy.subtitle}</p>

      {error && (
        <Notice tone="error" className="mt-5">
          {error}
        </Notice>
      )}
      {done ? (
        <Notice tone="success" className="mt-5">
          {done}
        </Notice>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate={false}>
          {mode === "sign-up" && (
            <Field label="Your name" htmlFor="name">
              <Input id="name" name="name" autoComplete="name" required maxLength={100} />
            </Field>
          )}
          {mode !== "reset" && (
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
          )}
          {mode !== "forgot" && (
            <Field
              label={mode === "reset" ? "New password" : "Password"}
              htmlFor="password"
              hint={mode === "sign-up" || mode === "reset" ? "At least 10 characters." : undefined}
            >
              <Input id="password" name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={mode === "sign-in" ? 1 : 10} maxLength={128} />
            </Field>
          )}
          {mode === "sign-in" && (
            <div className="-mt-1 text-right">
              <Link href="/forgot-password" className="text-xs text-fog hover:text-white">
                Forgot password?
              </Link>
            </div>
          )}
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            {copy.cta}
          </Button>
        </form>
      )}

      {googleEnabled && (mode === "sign-in" || mode === "sign-up") && !done && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-stone">
            <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
          </div>
          <Button
            variant="glass"
            className="w-full"
            size="lg"
            onClick={() => authClient.signIn.social({ provider: "google", callbackURL: safeNext(params.get("next")), newUserCallbackURL: "/onboarding" })}
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1S8.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.07-1.1-.16-1.6H12z" />
            </svg>
            Continue with Google
          </Button>
        </>
      )}

      <p className="mt-6 text-center text-sm text-fog">
        {mode === "sign-in" ? (
          <>
            New here?{" "}
            <Link href="/sign-up" className="text-moss hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            {mode === "sign-up" ? "Already have an account?" : "Remembered it?"}{" "}
            <Link href="/sign-in" className="text-moss hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
      {mode === "sign-up" && (
        <p className="mt-3 text-center text-xs text-stone">
          By creating an account you agree to the{" "}
          <Link href="/terms" className="underline hover:text-white">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline hover:text-white">
            Privacy Policy
          </Link>
          , including processing of content you choose to send to our AI providers.
        </p>
      )}
    </div>
  );
}
