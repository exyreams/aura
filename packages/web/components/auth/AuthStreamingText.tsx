"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";

function generateStream() {
  let content = "";

  for (let lineIndex = 0; lineIndex < 54; lineIndex++) {
    let line = "";
    for (let charIndex = 0; charIndex < 120; charIndex++) {
      line += chars[Math.floor(Math.random() * chars.length)];
    }
    content += `${line}\n`;
  }

  return content;
}

function generateSeedStream() {
  let content = "";

  for (let lineIndex = 0; lineIndex < 54; lineIndex++) {
    let line = "";
    for (let charIndex = 0; charIndex < 120; charIndex++) {
      const charOffset = (lineIndex * 17 + charIndex * 31) % chars.length;
      line += chars[charOffset];
    }
    content += `${line}\n`;
  }

  return content;
}

export function AuthStreamingText({ className }: { className?: string }) {
  const [streamContent, setStreamContent] = useState(generateSeedStream);

  useEffect(() => {
    setStreamContent(generateStream());

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const interval = setInterval(() => {
      setStreamContent(generateStream());
    }, 150);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-none absolute right-[2vw] top-1/2 w-[800px] -translate-y-1/2 overflow-hidden font-mono text-[10px] leading-4 text-primary opacity-[0.18] whitespace-pre text-right light:opacity-[0.14]",
        className,
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-x-0 top-0 z-10 h-24 bg-linear-to-b from-surface-raised to-transparent" />
      <div
        className="mask-[linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]"
        suppressHydrationWarning
      >
        {streamContent}
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 h-24 bg-linear-to-t from-surface-raised to-transparent" />
    </div>
  );
}
