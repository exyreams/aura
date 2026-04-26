import Image from "next/image";
import { Reveal } from "@/components/landing/Reveal";

export function Ecosystem() {
  const chains = [
    { name: "Ethereum", icon: "/assets/ethereum.svg" },
    { name: "Bitcoin", icon: "/assets/bitcoin.svg" },
    { name: "Solana", icon: "/assets/solana.svg" },
    { name: "Polygon", icon: "/assets/polygon.svg" },
    { name: "Arbitrum", icon: "/assets/arbitrum.svg" },
    { name: "Optimism", icon: "/assets/optimism.svg" },
  ];

  return (
    <section
      id="ecosystem"
      className="border-t border-border bg-(--text-main)/1 relative z-10 px-6 py-[120px] md:px-[4vw]"
    >
      <Reveal className="max-w-6xl mx-auto">
        <div className="mb-12 md:mb-16 text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-(--text-muted) mb-4 block">
            Interoperability
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-(--text-main)">
            Native Multi-Chain Settlement
          </h2>
          <p className="text-(--text-muted) mt-4 text-sm md:text-base">
            Co-sign transactions directly on the destination layer via dWallet
            tech.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-border border border-border">
          {chains.map((chain) => (
            <div
              key={chain.name}
              className="bg-(--bg) px-4 py-8 md:py-12 flex flex-col items-center justify-center gap-3 md:gap-4 transition-all duration-300 hover:bg-gray-500/5 group"
            >
              <div className="w-8 h-8 md:w-10 md:h-10 relative grayscale opacity-60 transition-all duration-300 group-hover:grayscale-0 group-hover:opacity-100">
                <Image
                  src={chain.icon}
                  alt={`${chain.name} logo`}
                  fill
                  className="object-contain"
                />
              </div>
              <span className="font-mono text-[9px] md:text-[10px] text-(--text-main)">
                {chain.name}
              </span>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
