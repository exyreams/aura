"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { DEFAULT_DOCS_URL } from "@/lib/settings";

export function DashboardFooter() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const logoSrc =
    !mounted || resolvedTheme === "dark"
      ? "/dark-logo-wordmark.svg"
      : "/light-logo-wordmark.svg";

  return (
    <footer className="pb-0 pt-0">
      <div
        className={[
          "max-w-[1600px] mx-auto rounded-tl-[14px] rounded-tr-[14px] px-8 lg:px-12 pt-8 pb-8 backdrop-blur-lg",
          "transition-[background-color,border-color,box-shadow] duration-300",
          !mounted || resolvedTheme === "dark"
            ? "bg-[rgba(28,28,32,0.82)] border border-[rgba(255,255,255,0.12)] shadow-[0_-8px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.07)]"
            : "bg-[rgba(255,255,255,0.72)] border border-[rgba(0,0,0,0.1)] shadow-[0_-8px_40px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.8)]",
        ].join(" ")}
      >
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3 grayscale opacity-30">
            <Image
              src={logoSrc}
              alt="AURA"
              width={60}
              height={15}
              className="h-[15px] w-auto"
              suppressHydrationWarning
            />
          </div>

          <div className="h-4 w-px bg-border hidden md:block" />

          <div className="flex flex-wrap justify-center gap-x-2 gap-y-3 mono text-[10px] text-(--text-muted)">
            <a
              href={DEFAULT_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors px-2 py-1 rounded-md"
            >
              Documentation
            </a>
            <a
              href={`${DEFAULT_DOCS_URL}/docs/sdk-ts`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors px-2 py-1 rounded-md"
            >
              API Docs
            </a>
            <a
              href="mailto:exyreams@gmail.com"
              className="hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors px-2 py-1 rounded-md"
            >
              Contact
            </a>
          </div>

          <div className="h-4 w-px bg-border hidden md:block" />

          <div className="mono text-[10px] text-(--text-muted) uppercase tracking-widest">
            © 2026 AURA PROTOCOL
          </div>
        </div>
      </div>
    </footer>
  );
}
