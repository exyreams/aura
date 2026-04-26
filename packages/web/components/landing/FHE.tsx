"use client";

import { useEffect, useRef } from "react";

export const LandingFHE = () => {
  const codeScrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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

    let lineIdx = 0;
    const updateCode = () => {
      if (!codeScrollerRef.current) return;

      const line = codeLines[lineIdx];
      const div = document.createElement("div");
      div.textContent = `> ${line}`;
      div.style.color = "#6B7280";
      div.style.marginBottom = "4px";

      codeScrollerRef.current.appendChild(div);

      if (codeScrollerRef.current.children.length > 5) {
        const firstChild = codeScrollerRef.current.firstChild;
        if (firstChild) {
          codeScrollerRef.current.removeChild(firstChild);
        }
      }

      lineIdx = (lineIdx + 1) % codeLines.length;
    };

    const interval = setInterval(updateCode, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="fhe" className="relative overflow-hidden px-[4vw] py-[120px]">
      <div
        className="absolute left-0 top-0 text-[10rem] font-black leading-none text-white/2 pointer-events-none z-[-1] uppercase"
        style={{ writingMode: "vertical-rl" }}
      >
        ENCRYPTION
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
        <div className="opacity-0 translate-y-[30px] animate-[fadeInUp_1s_ease-out_forwards]">
          <span className="mono text-xs uppercase tracking-widest text-primary mb-4 block">
            Core Architecture
          </span>
          <h2 className="text-5xl font-bold mb-8 leading-tight text-white">
            Privacy-Preserving
            <br />
            Policy Evaluation
          </h2>
          <p className="text-(--text-muted) text-lg mb-8">
            AURA leverages{" "}
            <strong className="text-(--secondary)">
              Fully Homomorphic Encryption (FHE)
            </strong>{" "}
            via Ika's Encrypt network. Your agent's risk parameters—max
            drawdown, daily volume, allowed assets—are stored as encrypted
            noise.
          </p>

          <ul className="space-y-6">
            <li className="flex gap-4">
              <i className="ri-checkbox-circle-line text-primary text-xl" />
              <div>
                <span className="block font-bold text-white">
                  Unreadable Constraints
                </span>
                <span className="text-(--text-muted) text-sm">
                  Validators compute the policy without ever knowing what the
                  policy is.
                </span>
              </div>
            </li>

            <li className="flex gap-4">
              <i className="ri-checkbox-circle-line text-primary text-xl" />
              <div>
                <span className="block font-bold text-white">
                  Ika dWallet Integration
                </span>
                <span className="text-(--text-muted) text-sm">
                  Native co-signing that works across chains without bridging
                  risks.
                </span>
              </div>
            </li>

            <li className="flex gap-4">
              <i className="ri-checkbox-circle-line text-primary text-xl" />
              <div>
                <span className="block font-bold text-white">MEV Immunity</span>
                <span className="text-(--text-muted) text-sm">
                  Because limits are hidden, bots cannot calculate your
                  liquidation or trade thresholds.
                </span>
              </div>
            </li>
          </ul>
        </div>

        <div className="opacity-0 translate-y-[30px] animate-[fadeInUp_1s_ease-out_0.2s_forwards]">
          <div className="bg-black border border-[#334155] rounded p-8 relative overflow-hidden">
            <div className="flex justify-between items-center mb-8">
              <span className="mono text-[10px] text-primary">
                POLICY_VAL_SECURE
              </span>
              <div className="flex gap-2">
                <div className="w-2 h-2 rounded-full bg-(--primary)/20" />
                <div className="w-2 h-2 rounded-full bg-(--primary)/40" />
                <div className="w-2 h-2 rounded-full bg-primary" />
              </div>
            </div>

            <div className="space-y-4 font-mono text-[11px]">
              <div className="p-3 bg-white/5 border border-white/10 rounded flex justify-between">
                <span className="text-(--text-muted)">Input Limit:</span>
                <span className="text-(--secondary)">
                  Ciphertext[8j2...9kx]
                </span>
              </div>

              <div className="p-3 bg-white/5 border border-white/10 rounded flex justify-between">
                <span className="text-(--text-muted)">Proposed Spend:</span>
                <span className="text-white">100.00 SOL</span>
              </div>

              <div className="flex justify-center py-6">
                <div className="relative">
                  <div className="w-3 h-3 bg-primary shadow-[0_0_15px_var(--primary)] rounded-full animate-pulse" />
                  <div className="absolute inset-0 bg-primary blur-xl opacity-20" />
                </div>
              </div>

              <div className="p-3 bg-(--primary)/20 border border-(--primary)/50 rounded flex justify-between">
                <span className="text-white font-bold">Verification:</span>
                <span className="text-white font-bold">
                  SUCCESS [FHE_OP_OK]
                </span>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 opacity-30 overflow-hidden">
                <div ref={codeScrollerRef} className="whitespace-pre" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
