"use client";

import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Check,
  Copy,
  KeyRound,
  Settings,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Tooltip } from "@/components/global/Tooltip";
import type { NoticeTone, SettingsSectionId } from "./types";

export const settingsSections: Array<{
  id: SettingsSectionId;
  label: string;
  icon: LucideIcon;
}> = [
  {
    id: "profile",
    label: "Profile",
    icon: UserRound,
  },
  {
    id: "security",
    label: "Security",
    icon: KeyRound,
  },
  {
    id: "privacy",
    label: "Sessions",
    icon: ShieldCheck,
  },
  {
    id: "wallets",
    label: "Wallets",
    icon: Wallet,
  },
  {
    id: "conduit",
    label: "Conduit",
    icon: Bot,
  },
  {
    id: "runtime",
    label: "Runtime",
    icon: Settings,
  },
];

export function Notice({
  tone,
  children,
}: {
  tone: NoticeTone;
  children: ReactNode;
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

export function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-border border-t py-3 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd
        className={
          mono
            ? "max-w-full break-all text-left font-mono text-xs sm:text-right"
            : "max-w-full break-words text-left text-sm sm:text-right"
        }
      >
        {value}
      </dd>
    </div>
  );
}

export function CopyButton({
  value,
  label,
}: {
  value: string | null | undefined;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopied(true);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Tooltip content={copied ? "Copied" : label}>
      <button
        type="button"
        onClick={() => void handleCopy()}
        disabled={!value}
        aria-label={label}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40"
      >
        {copied ? (
          <Check className="size-4 text-success" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
      </button>
    </Tooltip>
  );
}

export function SettingsSection({
  id,
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="overflow-hidden rounded-lg border border-border bg-surface"
    >
      <div className="flex flex-col gap-4 border-border border-b p-5 md:flex-row md:items-start md:justify-between md:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background/40 text-muted-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">
              {title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-5 md:p-6">{children}</div>
    </section>
  );
}

export function SettingsNav({
  activeSection,
  onSectionChange,
}: {
  activeSection: SettingsSectionId;
  onSectionChange: (sectionId: SettingsSectionId) => void;
}) {
  return (
    <aside className="xl:sticky xl:top-20">
      <nav
        aria-label="Settings sections"
        className="flex gap-1 overflow-x-auto border-border border-b pb-2 xl:grid xl:overflow-visible xl:border-b-0 xl:pb-0"
      >
        {settingsSections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSectionChange(section.id)}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "group flex min-h-11 min-w-36 items-center gap-3 rounded-md bg-surface-raised px-3 py-2.5 text-left text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background xl:min-w-0"
                  : "group flex min-h-11 min-w-36 items-center gap-3 rounded-md px-3 py-2.5 text-left text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background xl:min-w-0"
              }
            >
              <span
                className={
                  isActive
                    ? "flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary"
                    : "flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground transition-colors group-hover:text-foreground"
                }
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 truncate text-sm font-medium">
                {section.label}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-4 border-border border-t py-5 first:border-t-0 first:pt-0 last:pb-0 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
      <div>
        <h3 className="text-sm font-medium">{label}</h3>
        {description ? (
          <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function InlineStatus({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  children: ReactNode;
}) {
  const dotClass = {
    neutral: "bg-muted-foreground",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tone];

  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      <span>{children}</span>
    </span>
  );
}
