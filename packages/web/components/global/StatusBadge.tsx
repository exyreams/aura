import { cn } from "@/lib/utils";

const toneClass = {
  neutral: "border-border bg-surface text-muted-foreground",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
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
