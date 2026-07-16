"use client";

import { AlertCircle, CheckCircle2, ExternalLink, Info, X } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "danger" | "neutral";

interface ToastAction {
  label: string;
  href: string;
}

interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  action?: ToastAction;
}

interface ToastRecord extends Required<Pick<ToastInput, "tone" | "title">> {
  id: string;
  description?: string;
  action?: ToastAction;
}

interface ToastContextValue {
  show: (toast: ToastInput) => string;
  success: (
    title: string,
    input?: Omit<ToastInput, "title" | "tone">,
  ) => string;
  danger: (title: string, input?: Omit<ToastInput, "title" | "tone">) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const TOAST_TIMEOUT_MS = 5200;

const toneClass = {
  success: {
    border: "border-success/30",
    bg: "bg-success/10",
    icon: "text-success",
    Icon: CheckCircle2,
  },
  danger: {
    border: "border-danger/30",
    bg: "bg-danger/10",
    icon: "text-danger",
    Icon: AlertCircle,
  },
  neutral: {
    border: "border-border",
    bg: "bg-surface",
    icon: "text-muted-foreground",
    Icon: Info,
  },
} as const;

function createToastId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [mounted, setMounted] = useState(false);
  const timeoutsRef = useRef(new Map<string, number>());
  const reduceMotion = useReducedMotion();

  const dismiss = useCallback((id: string) => {
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      window.clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }

    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    ({ title, description, tone = "neutral", action }: ToastInput) => {
      const id = createToastId();
      setToasts((current) => [
        { id, title, description, tone, action },
        ...current.slice(0, 3),
      ]);

      const timeout = window.setTimeout(() => {
        dismiss(id);
      }, TOAST_TIMEOUT_MS);
      timeoutsRef.current.set(id, timeout);

      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    setMounted(true);

    return () => {
      for (const timeout of timeoutsRef.current.values()) {
        window.clearTimeout(timeout);
      }
      timeoutsRef.current.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (title, input) => show({ ...input, title, tone: "success" }),
      danger: (title, input) => show({ ...input, title, tone: "danger" }),
      dismiss,
    }),
    [dismiss, show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport
        mounted={mounted}
        toasts={toasts}
        dismiss={dismiss}
        reduceMotion={reduceMotion}
      />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  mounted,
  toasts,
  dismiss,
  reduceMotion,
}: {
  mounted: boolean;
  toasts: ToastRecord[];
  dismiss: (id: string) => void;
  reduceMotion: boolean | null;
}) {
  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return (
    <div
      aria-live="polite"
      aria-relevant="additions text"
      className="pointer-events-none fixed right-3 bottom-3 z-[10000] flex w-[min(calc(100vw-1.5rem),24rem)] flex-col gap-2 sm:right-5 sm:bottom-5"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const tone = toneClass[toast.tone];
          const Icon = tone.Icon;

          return (
            <m.div
              key={toast.id}
              role={toast.tone === "danger" ? "alert" : "status"}
              layout={reduceMotion ? false : "position"}
              initial={
                reduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, y: 10, scale: 0.98 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: 6, scale: 0.98 }
              }
              transition={{ duration: reduceMotion ? 0 : 0.16 }}
              className={cn(
                "pointer-events-auto rounded-md border p-3 shadow-lg backdrop-blur",
                tone.border,
                tone.bg,
              )}
            >
              <div className="flex items-start gap-3">
                <Icon
                  className={cn("mt-0.5 size-4 shrink-0", tone.icon)}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {toast.title}
                  </p>
                  {toast.description ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {toast.description}
                    </p>
                  ) : null}
                  {toast.action ? (
                    <a
                      href={toast.action.href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary/50 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {toast.action.label}
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss notification"
                  className="flex size-10 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </m.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function useToast() {
  const value = use(ToastContext);
  if (!value) {
    throw new Error("useToast must be used within ToastProvider.");
  }

  return value;
}
