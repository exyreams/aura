"use client";

import { m } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function AuthFormTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <m.div
      key={pathname}
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: [0, 0, 0.2, 1] }}
      className="w-full"
    >
      {children}
    </m.div>
  );
}
