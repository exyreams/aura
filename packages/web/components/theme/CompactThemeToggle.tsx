"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function CompactThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-8 h-8 rounded-sm border border-border bg-(--card-bg)" />
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
        "relative w-8 h-8 rounded-sm border border-border bg-(--card-bg) hover:bg-(--hover-bg) transition-colors flex items-center justify-center",
      )}
    >
      {isDark ? (
        <Moon className="w-3.5 h-3.5 text-(--text-main)" />
      ) : (
        <Sun className="w-3.5 h-3.5 text-(--text-main)" />
      )}
    </button>
  );
}
