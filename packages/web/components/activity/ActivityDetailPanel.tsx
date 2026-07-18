"use client";

import { ArrowRight, ExternalLink } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { ActivityRelatedRecord } from "@/lib/activity";
import type { ActivityEventRow } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

interface ActivityDetailPanelProps {
  event: ActivityEventRow;
  expanded: boolean;
  hasSessionAction: boolean;
  hasWalletAction: boolean;
  isConduitEvent: boolean;
  records: ActivityRelatedRecord[];
  requestMessage: string | null;
  summary: string | null;
}

interface DetailActionLinkProps {
  href: string;
  children: ReactNode;
  external?: boolean;
}

function DetailValue({ title, value, mono = false }: ActivityRelatedRecord) {
  return (
    <div className="flex items-start gap-2 font-mono text-[10px] sm:gap-3">
      <span className="w-24 shrink-0 text-muted-foreground sm:w-36">
        {title}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-foreground",
          mono && "font-mono",
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function DetailActionLink({
  href,
  children,
  external = false,
}: DetailActionLinkProps) {
  const className =
    "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-sm border border-border bg-surface-raised px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
        <ExternalLink className="size-3" aria-hidden="true" />
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
      <ArrowRight className="size-3" aria-hidden="true" />
    </Link>
  );
}

export function ActivityDetailPanel({
  event,
  expanded,
  hasSessionAction,
  hasWalletAction,
  isConduitEvent,
  records,
  requestMessage,
  summary,
}: ActivityDetailPanelProps) {
  const reduceMotion = useReducedMotion();
  const hasActions =
    hasWalletAction ||
    hasSessionAction ||
    isConduitEvent ||
    event.tx_signature !== null;
  const initialState = reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, transform: "translateY(-2px)" };
  const animateState = reduceMotion
    ? { opacity: 1 }
    : { opacity: 1, transform: "translateY(0)" };
  const exitState = reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, transform: "translateY(-2px)" };

  return (
    <AnimatePresence initial={false}>
      {expanded ? (
        <m.div
          initial={initialState}
          animate={animateState}
          exit={exitState}
          transition={{
            duration: reduceMotion ? 0.1 : 0.16,
            ease: [0.23, 1, 0.32, 1],
          }}
          className="overflow-hidden"
        >
          <div
            className="mt-2 overflow-hidden rounded-sm border border-border"
            style={{ background: "var(--accordion-bg)" }}
          >
            {summary ? (
              <div className="border-b border-border px-3 py-2.5">
                <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {summary}
                </p>
              </div>
            ) : null}

            <div
              className="space-y-1.5 px-3 py-2.5"
              style={{ background: "var(--accordion-content)" }}
            >
              {records.map((record) => (
                <DetailValue key={record.title} {...record} />
              ))}

              {requestMessage ? (
                <div className="flex items-start gap-2 font-mono text-[10px] sm:gap-3">
                  <span className="w-24 shrink-0 text-muted-foreground sm:w-36">
                    Request summary
                  </span>
                  <span className="min-w-0 flex-1 text-foreground">
                    {requestMessage}
                  </span>
                </div>
              ) : null}

              {hasActions ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
                  {hasWalletAction ? (
                    <DetailActionLink href="/dashboard/wallets">
                      Open wallet
                    </DetailActionLink>
                  ) : null}
                  {hasSessionAction ? (
                    <DetailActionLink href="/dashboard/agents">
                      Open sessions
                    </DetailActionLink>
                  ) : null}
                  {isConduitEvent ? (
                    <DetailActionLink href="/dashboard/conduit">
                      Open Conduit
                    </DetailActionLink>
                  ) : null}
                  {event.tx_signature ? (
                    <DetailActionLink
                      href={`https://explorer.solana.com/tx/${event.tx_signature}?cluster=devnet`}
                      external
                    >
                      Explorer
                    </DetailActionLink>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
