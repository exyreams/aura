"use client";

import { useEffect, useState } from "react";

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";

export function StreamingText() {
  const [content, setContent] = useState("");

  useEffect(() => {
    const generate = () => {
      let out = "";
      for (let i = 0; i < 50; i++) {
        let line = "";
        for (let j = 0; j < 120; j++) {
          line += chars[Math.floor(Math.random() * chars.length)];
        }
        out += `${line}\n`;
      }
      setContent(out);
    };

    generate();
    const id = setInterval(generate, 150);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="absolute right-[2vw] top-1/2 -translate-y-1/2 w-[800px] pointer-events-none hidden lg:block">
      <div className="relative overflow-hidden font-mono text-[10px] text-[var(--primary)] opacity-25 whitespace-pre text-right h-[600px]">
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-[var(--bg)] to-transparent z-10" />
        <div
          style={{
            maskImage:
              "linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)",
          }}
        >
          {content}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[var(--bg)] to-transparent z-10" />
      </div>
    </div>
  );
}
