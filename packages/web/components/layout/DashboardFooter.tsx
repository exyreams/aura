"use client";

import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function DashboardFooter() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const logoSrc =
    !mounted || resolvedTheme === "dark" ? "/logo-dark.svg" : "/logo-light.svg";

  return (
    <footer className="py-12 px-8 lg:px-12 bg-(--bg)">
      <div className="max-w-[1600px] mx-auto">
        <div className="h-px w-full bg-linear-to-r from-transparent via-border to-transparent mb-12" />

        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3 grayscale opacity-30">
            <Image
              src={logoSrc}
              alt="AURA"
              width={60}
              height={15}
              className="h-[15px] w-auto"
            />
          </div>

          <div className="h-4 w-px bg-border hidden md:block" />

          <div className="flex gap-10 mono text-[10px] text-(--text-muted)">
            <Link
              href="#"
              className="hover:text-(--text-main) transition-colors"
            >
              Network Stats
            </Link>
            <Link
              href="/docs"
              className="hover:text-(--text-main) transition-colors"
            >
              Documentation
            </Link>
            <Link
              href="/docs/api"
              className="hover:text-(--text-main) transition-colors"
            >
              API Docs
            </Link>
            <Link
              href="/support"
              className="hover:text-(--text-main) transition-colors"
            >
              Support
            </Link>
          </div>

          <div className="h-4 w-px bg-border hidden md:block" />

          <div className="mono text-[10px] text-(--text-muted) uppercase tracking-widest">
            © 2026 AURA LABS {"//"} APP_V1.0.4-BETA
          </div>
        </div>
      </div>
    </footer>
  );
}
