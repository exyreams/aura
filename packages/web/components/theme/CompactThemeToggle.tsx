"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function CompactThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mountedRef = useRef(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    forceUpdate((n) => n + 1);
  }, []);

  if (!mountedRef.current) {
    return (
      <div className="size-8 rounded-sm border border-border bg-(--card-bg)" />
    );
  }

  const isDark = resolvedTheme === "dark";

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "relative size-8 rounded-sm border border-border bg-(--card-bg) hover:bg-(--hover-bg) transition-colors flex items-center justify-center",
      )}
    >
      {isDark ? (
        <Moon className="size-3.5 text-(--text-main)" />
      ) : (
        <Sun className="size-3.5 text-(--text-main)" />
      )}
    </button>
  );
}
