"use client";

import { Moon, Sun } from "lucide-react";
import { m } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/global/Button";

export const ThemeToggle = () => {
  const { setTheme, resolvedTheme } = useTheme();
  const mountedRef = useRef(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    forceUpdate((n) => n + 1);
  }, []);

  if (!mountedRef.current) {
    return (
      <Button variant="ghost" size="small" className="w-[34px]! px-0!">
        <span className="size-4" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="small"
      className="w-[34px]! px-0! relative overflow-hidden"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      <m.span
        className="absolute"
        animate={{
          scale: isDark ? 1 : 0,
          opacity: isDark ? 1 : 0,
          rotate: isDark ? 0 : 180,
        }}
        transition={{ duration: 0.2 }}
      >
        <Moon className="size-4" />
      </m.span>
      <m.span
        className="absolute"
        animate={{
          scale: isDark ? 0 : 1,
          opacity: isDark ? 0 : 1,
          rotate: isDark ? -180 : 0,
        }}
        transition={{ duration: 0.2 }}
      >
        <Sun className="size-4" />
      </m.span>
    </Button>
  );
};
