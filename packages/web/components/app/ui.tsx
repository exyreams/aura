import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow?: string;
  title: string;
  copy?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-3">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="text-4xl font-semibold tracking-tight text-white">
          {title}
        </h1>
        {copy ? (
          <p className="max-w-3xl text-sm leading-7 text-slate-400">{copy}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: ReactNode;
  helper: string;
}) {
  return (
    <div className="glass-panel p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="metric-value mt-4">{value}</p>
      <p className="mt-3 text-sm text-slate-400">{helper}</p>
    </div>
  );
}

export function Surface({
  title,
  copy,
  action,
  children,
  className,
}: {
  title: string;
  copy?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("glass-panel p-6", className)}>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          {copy ? (
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
              {copy}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatusPill({
  status,
  className,
}: {
  status:
    | "Active"
    | "Paused"
    | "Pending"
    | "Approved"
    | "Denied"
    | "Running"
    | "Stopped";
  className?: string;
}) {
  const tone =
    status === "Active" || status === "Approved" || status === "Running"
      ? "status-active"
      : status === "Pending"
        ? "status-pending"
        : "status-paused";

  return (
    <span className={cn(tone, className)}>
      <span
        className={cn(
          "status-dot",
          status === "Pending"
            ? "bg-warning"
            : status === "Active" ||
                status === "Approved" ||
                status === "Running"
              ? "bg-success"
              : "bg-danger",
        )}
      />
      {status}
    </span>
  );
}

export function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="button-secondary text-sm" href={href}>
      {label}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

export function EmptyState({
  title,
  copy,
  action,
}: {
  title: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-white/12 bg-white/3 px-6 py-12 text-center">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-400">
        {copy}
      </p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
