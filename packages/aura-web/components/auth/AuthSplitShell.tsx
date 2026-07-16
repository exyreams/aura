import { LockKeyhole } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AuthFormTransition } from "@/components/auth/AuthFormTransition";
import { AuthStreamingText } from "@/components/auth/AuthStreamingText";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

interface AuthSplitShellProps {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  visualLabel?: string;
  visualTitle?: string;
  visualDescription?: string;
}

export function AuthSplitShell({
  title,
  description,
  children,
  footer,
  visualLabel = "AURA identity",
  visualTitle = "One account for email sessions and verified wallets.",
  visualDescription = "Sign in with email, keep the session across reloads, then link the wallets that can operate the control plane.",
}: AuthSplitShellProps) {
  return (
    <main className="relative min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[minmax(420px,0.82fr)_minmax(520px,1fr)]">
      <div className="fixed right-4 top-4 z-50">
        <ThemeToggle className="bg-surface/90 border border-border shadow-sm backdrop-blur" />
      </div>

      <aside className="relative m-4 hidden min-h-[calc(100vh-2rem)] overflow-hidden rounded-lg border border-border bg-surface-raised lg:flex">
        <div
          className="absolute inset-0 opacity-80"
          style={{
            backgroundImage:
              "linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
          aria-hidden="true"
        />
        <AuthStreamingText className="h-[680px]" />
        <div className="pointer-events-none absolute -left-28 -top-28 size-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-0 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-linear-to-t from-primary/10 via-primary/5 to-transparent" />

        <div className="relative z-10 flex min-h-full w-full flex-col p-10 pb-5 xl:p-12 xl:pb-6">
          <Link
            href="/"
            className="inline-flex min-h-10 w-fit items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Back to AURA home"
          >
            <Image
              src="/dark-logo-wordmark.svg"
              alt="AURA"
              width={144}
              height={36}
              priority
              className="h-8 w-auto light:hidden"
            />
            <Image
              src="/light-logo-wordmark.svg"
              alt="AURA"
              width={144}
              height={36}
              priority
              className="hidden h-8 w-auto light:block"
            />
          </Link>

          <div className="grid flex-1 place-items-center py-10">
            <div className="mx-auto max-w-md text-center">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {visualLabel}
              </p>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight xl:text-5xl">
                {visualTitle}
              </h1>
              <p className="mt-5 max-w-lg text-sm leading-6 text-muted-foreground">
                {visualDescription}
              </p>
            </div>
          </div>

          <div className="mx-auto mt-auto flex max-w-md items-start justify-center gap-2 text-center text-xs leading-5 text-muted-foreground">
            <LockKeyhole
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            <p>
              Email signs you in first. Wallets are linked only after a signed
              challenge from that active account session.
            </p>
          </div>
        </div>
      </aside>

      <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:px-12">
        <AuthFormTransition>
          <div className="mx-auto w-full max-w-[448px]">
            <Link
              href="/"
              className="mb-10 inline-flex min-h-10 w-fit items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:hidden"
              aria-label="Back to AURA home"
            >
              <Image
                src="/dark-logo-wordmark.svg"
                alt="AURA"
                width={136}
                height={34}
                priority
                className="h-8 w-auto light:hidden"
              />
              <Image
                src="/light-logo-wordmark.svg"
                alt="AURA"
                width={136}
                height={34}
                priority
                className="hidden h-8 w-auto light:block"
              />
            </Link>

            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
            {children}
            {footer ? (
              <div className="mt-7 text-center text-sm text-muted-foreground">
                {footer}
              </div>
            ) : null}
          </div>
        </AuthFormTransition>
      </section>
    </main>
  );
}
