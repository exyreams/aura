import { cn } from "@/lib/utils";

const toneClass = {
  neutral: "border-border bg-surface text-muted",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  danger: "border-red-500/25 bg-red-500/10 text-red-300",
} as const;

export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof toneClass;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-1 font-mono text-[11px] uppercase leading-none tracking-wide",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
