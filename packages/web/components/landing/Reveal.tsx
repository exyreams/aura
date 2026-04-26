"use client";

import { motion } from "motion/react";
import type React from "react";

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -15% 0px" }}
      transition={{ duration: 1, ease: [0.215, 0.61, 0.355, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
