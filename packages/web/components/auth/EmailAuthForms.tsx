"use client";

import { Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type React from "react";
import { useMemo, useState } from "react";
import { AuthSplitShell } from "@/components/auth/AuthSplitShell";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import { Button } from "@/components/global/Button";
import { Checkbox } from "@/components/global/Checkbox";
import { Input, type InputProps } from "@/components/global/Input";

type AuthMode = "sign-in" | "sign-up" | "forgot-password" | "reset-password";

const authInlineLinkClass =
  "font-semibold text-(--info-text) underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed.";

  if (message.toLowerCase().includes("signups not allowed for otp")) {
    return "Magic links only work for existing AURA accounts. Create an account first, then return here.";
  }

  return message;
}

function Notice({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: React.ReactNode;
}) {
  return (
    <p
      className={
        tone === "success"
          ? "rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
          : "rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
      }
    >
      {children}
    </p>
  );
}

function AuthDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-1 text-center">
      <div className="h-px flex-1 bg-border" />
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {children}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function PasswordInput({
  className,
  ...props
}: Omit<InputProps, "rightAdornment" | "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      {...props}
      type={visible ? "text" : "password"}
      spellCheck={false}
      className={className}
      rightAdornment={
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="flex min-h-10 min-w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      }
    />
  );
}

export function EmailAuthForm({ mode }: { mode: AuthMode }) {
  if (mode === "sign-up") {
    return <SignUpForm />;
  }

  if (mode === "forgot-password") {
    return <ForgotPasswordForm />;
  }

  if (mode === "reset-password") {
    return <ResetPasswordForm />;
  }

  return <SignInForm />;
}

export function EmailAuthFallback() {
  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(420px,0.82fr)_minmax(520px,1fr)]">
      <aside className="m-4 hidden min-h-[calc(100vh-2rem)] rounded-lg border border-border bg-surface-raised lg:block" />
      <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:px-12">
        <div className="w-full max-w-[448px]">
          <div className="mb-6 h-10 w-28 rounded-md bg-muted" />
          <div className="h-7 w-40 rounded-md bg-muted" />
          <div className="mt-3 h-4 w-full rounded-md bg-muted" />
          <div className="mt-2 h-4 w-3/4 rounded-md bg-muted" />
          <div className="mt-6 h-11 w-full rounded-md bg-muted" />
        </div>
      </section>
    </main>
  );
}

function SignInForm() {
  const auth = useOwnerAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = useMemo(() => {
    const value = searchParams.get("next");
    return value?.startsWith("/") ? value : "/dashboard";
  }, [searchParams]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePasswordSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    setError(null);
    try {
      await auth.signInWithPassword(email.trim(), password);
      router.push(next);
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  const handleMagicLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    setError(null);

    if (!email.trim()) {
      setError("Enter your email before requesting a magic link.");
      return;
    }

    try {
      const result = await auth.signInWithMagicLink(email.trim());
      setStatus(result.message);
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  return (
    <AuthSplitShell
      title="Welcome back!"
      description="Log in to your AURA account."
      footer={
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>No account?</span>
          <Link href="/auth/signup" className={authInlineLinkClass}>
            Create account
          </Link>
        </div>
      }
    >
      <div className="mt-6 grid gap-5">
        {status ? <Notice tone="success">{status}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}

        <form onSubmit={handlePasswordSignIn} className="grid gap-4">
          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            spellCheck={false}
            floatingLabel
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <PasswordInput
            label="Password"
            autoComplete="current-password"
            floatingLabel
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <div className="flex min-h-8 items-center justify-between gap-3">
            <Checkbox
              checked={rememberMe}
              onChange={setRememberMe}
              className="items-center gap-2"
            >
              <span className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                Remember me
              </span>
            </Checkbox>
            <Link
              href="/auth/recover"
              className={`text-xs ${authInlineLinkClass}`}
            >
              Forgot password?
            </Link>
          </div>
          <Button
            type="submit"
            variant="primary"
            loading={auth.isSigningIn}
            disabled={auth.isSigningIn}
            icon={<KeyRound className="size-3" aria-hidden="true" />}
          >
            Sign in
          </Button>
        </form>

        <AuthDivider>or</AuthDivider>

        <form onSubmit={handleMagicLink} className="grid gap-2">
          <Button
            type="submit"
            variant="secondary"
            loading={auth.isSubmitting}
            disabled={auth.isSubmitting}
            icon={<Mail className="size-3" aria-hidden="true" />}
          >
            Magic link
          </Button>
          <p className="text-center text-xs leading-5 text-muted-foreground">
            Magic links are sent to the email above and work for existing AURA
            accounts.
          </p>
        </form>
      </div>
    </AuthSplitShell>
  );
}

function SignUpForm() {
  const auth = useOwnerAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters for the password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      const result = await auth.signUpWithPassword(email.trim(), password);
      setStatus(result.message);
      router.push("/dashboard/settings");
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  return (
    <AuthSplitShell
      title="Let's get you started"
      description="Create your account, then link a wallet."
      visualLabel="Account setup"
      visualTitle="Start with email. Link wallets after."
      visualDescription="AURA keeps sessions, recovery, and verified wallet ownership under one account so the control plane does not create duplicate identities."
      footer={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span>Already have an account?</span>
          <Link href="/auth/login" className={authInlineLinkClass}>
            Sign in
          </Link>
        </div>
      }
    >
      <form onSubmit={handleSignUp} className="mt-6 grid gap-4">
        {status ? <Notice tone="success">{status}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          spellCheck={false}
          floatingLabel
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <PasswordInput
          label="Create password"
          autoComplete="new-password"
          helperText="Use at least 8 characters."
          floatingLabel
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <PasswordInput
          label="Confirm password"
          autoComplete="new-password"
          floatingLabel
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
        <Button
          type="submit"
          variant="primary"
          loading={auth.isSubmitting}
          disabled={auth.isSubmitting}
          icon={<Mail className="size-3" aria-hidden="true" />}
        >
          Create account
        </Button>
      </form>
    </AuthSplitShell>
  );
}

function ForgotPasswordForm() {
  const auth = useOwnerAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    setError(null);
    try {
      const result = await auth.sendPasswordReset(email.trim());
      setStatus(result.message);
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  return (
    <AuthSplitShell
      title="Reset password"
      description="Send a recovery link to the email address on your AURA account."
      visualLabel="Account recovery"
      visualTitle="Recover access without changing wallet ownership."
      visualDescription="Password recovery happens through Supabase email links. Wallet links stay bound to the same account identity."
      footer={
        <Link href="/auth/login" className={authInlineLinkClass}>
          Return to sign in
        </Link>
      }
    >
      <form onSubmit={handleReset} className="mt-6 grid gap-4">
        {status ? <Notice tone="success">{status}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          spellCheck={false}
          floatingLabel
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Button
          type="submit"
          variant="primary"
          loading={auth.isSubmitting}
          disabled={auth.isSubmitting}
          icon={<Mail className="size-3" aria-hidden="true" />}
        >
          Send recovery link
        </Button>
      </form>
    </AuthSplitShell>
  );
}

function ResetPasswordForm() {
  const auth = useOwnerAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters for the password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      const result = await auth.updatePassword(password);
      setStatus(result.message);
      router.push("/dashboard/settings");
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  return (
    <AuthSplitShell
      title="Choose a new password"
      description="Set a new password for the account opened by your recovery link."
      visualLabel="Password reset"
      visualTitle="Set a new credential for the same AURA account."
      visualDescription="The reset link opens a Supabase session, then this page updates only the password on that account."
      footer={
        <Link href="/auth/login" className={authInlineLinkClass}>
          Return to sign in
        </Link>
      }
    >
      <form onSubmit={handleUpdate} className="mt-6 grid gap-4">
        {status ? <Notice tone="success">{status}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <PasswordInput
          label="New password"
          autoComplete="new-password"
          floatingLabel
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <PasswordInput
          label="Confirm password"
          autoComplete="new-password"
          floatingLabel
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
        <Button
          type="submit"
          variant="primary"
          loading={auth.isSubmitting}
          disabled={auth.isSubmitting || !auth.session}
          icon={<KeyRound className="size-3" aria-hidden="true" />}
        >
          Update password
        </Button>
      </form>
    </AuthSplitShell>
  );
}
