import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/global/Button";

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";

export function Hero() {
  const [streamContent, setStreamContent] = useState("");

  useEffect(() => {
    const generateStream = () => {
      let content = "";
      for (let i = 0; i < 50; i++) {
        let line = "";
        for (let j = 0; j < 120; j++) {
          line += chars[Math.floor(Math.random() * chars.length)];
        }
        content += `${line}\n`;
      }
      setStreamContent(content);
    };

    generateStream();
    const interval = setInterval(generateStream, 150);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col justify-center items-start z-10 px-6 py-[120px] md:px-[4vw] overflow-hidden">
      {/* Streaming text with ENCRYPTED label */}
      <div className="absolute right-[2vw] mt-8 top-1/2 -translate-y-1/2 w-[800px] pointer-events-none">
        <div className="relative overflow-hidden font-mono text-[10px] text-primary opacity-30 whitespace-pre text-right h-[600px]">
          {/* Top shadow */}
          <div className="absolute top-0 left-0 right-0 h-20 bg-linear-to-b from-(--bg) to-transparent z-10 pointer-events-none"></div>

          {/* Content with mask */}
          <div className="mask-[linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]">
            {streamContent}
          </div>

          {/* Bottom shadow */}
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-linear-to-t from-(--bg) to-transparent z-10 pointer-events-none"></div>
        </div>
      </div>
      <div className="absolute -bottom-8 left-0 right-0 text-[8rem] md:text-[12rem] font-black leading-none text-(--text-main)/2 pointer-events-none -z-10 uppercase text-center overflow-hidden whitespace-nowrap">
        AUTONOMOUS
      </div>

      <div className="max-w-4xl relative z-10">
        <div className="inline-block px-3 py-1 bg-gray-500/10 border border-primary text-primary font-mono text-[0.7rem] uppercase mb-4">
          Alpha Release 0.1
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter leading-[0.9] mb-8 text-(--text-main)">
          Autonomous
          <br />
          Universal
          <br />
          <span className="bg-linear-to-r from-gray-100 via-gray-300 to-gray-500 bg-clip-text text-transparent">
            Resource Agent
          </span>
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl leading-[1.6] font-light mb-10">
          Encrypted guardrails for AI agent treasuries on Solana. Manage wealth
          autonomously without exposing strategy or trusting centralized
          gatekeepers.
        </p>
        <div className="flex flex-wrap gap-4">
          <Button
            variant="primary"
            className="rounded-none! font-mono! text-xs! uppercase! tracking-widest! px-10! py-4!"
            icon={<ArrowRight className="w-4 h-4 ml-2" />}
          >
            Deploy Guardrail
          </Button>
          <Button
            variant="secondary"
            className="rounded-none! font-mono! text-xs! uppercase! tracking-widest! px-10! py-4!"
          >
            Read Whitepaper
          </Button>
        </div>
      </div>
    </section>
  );
}
