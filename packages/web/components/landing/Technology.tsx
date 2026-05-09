import { CheckCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/landing/Reveal";

const codeLines = [
  "FHE_OP_INIT [0x42f...]",
  "DECRYPT_GATEWAY_OPENED",
  "HOMOMORPHIC_ADD (CIPHER_A, CIPHER_B)",
  "THRESHOLD_CHECK: VALID",
  "IKANET_SIGNATURE_REQ",
  "MULTI_SIG_GENERATE_PARTIAL",
  "AGGREGATING_PROOF...",
  "SUCCESS_CODE_200",
  "SETTLE_SOLANA_MAINNET",
  "TX_ID: 5u9...X7e",
  "RE_ENCRYPTING_BOUNDS...",
  "STORAGE_UPDATE_COMPLETE",
];

export function Technology() {
  const [visibleLines, setVisibleLines] = useState<string[]>(() =>
    codeLines.slice(0, 5),
  );
  const lineIdxRef = useRef(5);

  useEffect(() => {
    const interval = setInterval(() => {
      const lineIdx = lineIdxRef.current;
      setVisibleLines((prev) => {
        const nextLines = [...prev, codeLines[lineIdx]];
        if (nextLines.length > 5) {
          nextLines.shift();
        }
        return nextLines;
      });
      lineIdxRef.current = (lineIdx + 1) % codeLines.length;
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <section
      id="fhe"
      className="border-t border-border relative overflow-hidden z-10 px-6 py-[120px] md:px-[4vw]"
    >
      <div className="absolute right-auto left-0 top-0 [writing-mode:vertical-rl] text-[6rem] md:text-[10rem] font-black leading-none text-(--text-main)/2 pointer-events-none -z-10 uppercase">
        ENCRYPTION
      </div>
      <Reveal className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-20 items-center">
        <div>
          <span className="font-mono text-xs uppercase tracking-widest text-(--text-muted) mb-4 block">
            Core Architecture
          </span>
          <h2 className="text-3xl md:text-5xl font-semibold mb-6 md:mb-8 leading-tight text-(--text-main)">
            Policy Evaluation
            <br />
            Over Encrypted State
          </h2>
          <p className="text-(--text-muted) text-base md:text-lg mb-6 md:mb-8">
            AURA uses{" "}
            <strong className="text-primary">
              Fully Homomorphic Encryption (FHE)
            </strong>{" "}
            via Ika's Encrypt network. Daily limits, per-transaction caps, and
            running spend counters are stored as FHE scalar ciphertexts on-chain. The
            policy engine evaluates them without ever decrypting the values.
          </p>
          <ul className="space-y-4 md:space-y-6">
            <li className="flex gap-3 md:gap-4">
              <CheckCircle className="size-5 md:size-6 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="block font-bold text-(--text-main) text-sm md:text-base">
                  Encrypted on-chain limits
                </span>
                <span className="text-(--text-muted) text-xs md:text-sm">
                  Spending policy is stored as FHE scalar or vector ciphertexts.
                  No validator or observer can read the actual values.
                </span>
              </div>
            </li>
            <li className="flex gap-3 md:gap-4">
              <CheckCircle className="size-5 md:size-6 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="block font-bold text-(--text-main) text-sm md:text-base">
                  Ika dWallet co-signing
                </span>
                <span className="text-(--text-muted) text-xs md:text-sm">
                  Approved proposals are co-signed by Ika dWallet records,
                  enabling native multi-chain execution without raw key exposure.
                </span>
              </div>
            </li>
            <li className="flex gap-3 md:gap-4">
              <CheckCircle className="size-5 md:size-6 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="block font-bold text-(--text-main) text-sm md:text-base">
                  MEV-resistant by design
                </span>
                <span className="text-(--text-muted) text-xs md:text-sm">
                  Hidden limits mean bots cannot calculate your thresholds,
                  front-run your trades, or infer your strategy from on-chain data.
                </span>
              </div>
            </li>
          </ul>
        </div>

        <div>
          <div className="bg-(--card-bg) border border-border rounded-md p-6 md:p-8 relative overflow-hidden">
            <div className="flex justify-between items-center mb-6 md:mb-8">
              <span className="font-mono text-[9px] md:text-[10px] text-primary uppercase tracking-widest">
                Policy Val Secure
              </span>
              <div className="flex gap-1.5 md:gap-2">
                <div className="size-1.5 md:size-2 rounded-full bg-primary opacity-20" />
                <div className="size-1.5 md:size-2 rounded-full bg-primary opacity-40" />
                <div className="size-1.5 md:size-2 rounded-full bg-primary" />
              </div>
            </div>
            <div className="space-y-3 md:space-y-4 font-mono text-[10px] md:text-[11px]">
              <div className="p-2.5 md:p-3 bg-(--card-content) border border-border rounded flex justify-between gap-2">
                <span className="text-(--text-muted)">Daily Limit:</span>
                <span className="text-primary truncate">
                  Ciphertext[8j2...9kx]
                </span>
              </div>
              <div className="p-2.5 md:p-3 bg-(--card-content) border border-border rounded flex justify-between gap-2">
                <span className="text-(--text-muted)">Proposed Spend:</span>
                <span className="text-(--text-main)">$450.00 USD</span>
              </div>
              <div className="p-2.5 md:p-3 bg-(--card-content) border border-border rounded flex justify-between gap-2">
                <span className="text-(--text-muted)">Spent Today:</span>
                <span className="text-primary truncate">
                  Ciphertext[3f9...1ab]
                </span>
              </div>
              <div className="flex justify-center py-4 md:py-6">
                <div className="relative">
                  <div className="size-2.5 md:size-3 bg-primary shadow-[0_0_15px_var(--primary)] rounded-full animate-pulse" />
                  <div className="absolute inset-0 bg-primary blur-xl opacity-20" />
                </div>
              </div>
              <div className="p-2.5 md:p-3 bg-primary/10 border border-primary/30 rounded flex justify-between gap-2">
                <span className="text-(--text-main) font-bold">
                  FHE Result:
                </span>
                <span className="text-primary font-bold">
                  APPROVED [violation=0]
                </span>
              </div>
              <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-border opacity-50 overflow-hidden">
                <div className="whitespace-pre text-[9px] md:text-[10px]">
                  {visibleLines.map((line) => (
                    <div key={line} className="text-(--text-muted) mb-1">
                      &gt; {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
