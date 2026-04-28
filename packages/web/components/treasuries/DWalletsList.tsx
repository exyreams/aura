import Image from "next/image";
import { StatusPill } from "@/components/global/Badge";
import { Card } from "@/components/global/Card";

export const DWalletsList = () => {
  return (
    <Card hover={false}>
      <div className="mb-8">
        <h2 className="text-xl font-bold text-(--text-main) mb-1">dWallets</h2>
        <p className="text-[12px] text-(--text-muted)">
          Registered from on-chain dWallet records.
        </p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between p-4 bg-(--card-content) border border-border rounded-sm hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-sm bg-(--card-bg) flex items-center justify-center border border-border p-1.5">
              <Image
                src="/assets/ethereum.svg"
                alt="Ethereum"
                width={20}
                height={20}
              />
            </div>
            <div>
              <div className="font-semibold text-sm text-(--text-main)">
                Ethereum
              </div>
              <div className="font-mono text-[10px] text-(--text-muted)">
                0x7a2b...9e4f
              </div>
            </div>
          </div>
          <div className="text-right flex flex-col items-end">
            <div className="font-mono text-xs text-(--text-main) mb-1">
              $45,230.00
            </div>
            <StatusPill variant="active">Active</StatusPill>
          </div>
        </div>
        <div className="flex items-center justify-between p-4 bg-(--card-content) border border-border rounded-sm hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-sm bg-(--card-bg) flex items-center justify-center border border-border p-1.5">
              <Image
                src="/assets/solana.svg"
                alt="Solana"
                width={20}
                height={20}
              />
            </div>
            <div>
              <div className="font-semibold text-sm text-(--text-main)">
                Solana
              </div>
              <div className="font-mono text-[10px] text-(--text-muted)">
                8mR2...1pQ
              </div>
            </div>
          </div>
          <div className="text-right flex flex-col items-end">
            <div className="font-mono text-xs text-(--text-main) mb-1">
              $12,450.00
            </div>
            <StatusPill variant="active">Active</StatusPill>
          </div>
        </div>
        <div className="flex items-center justify-between p-4 bg-(--card-content) border border-border rounded-sm hover:border-primary/30 transition-colors opacity-80">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-sm bg-(--card-bg) flex items-center justify-center border border-border p-1.5">
              <Image
                src="/assets/bitcoin.svg"
                alt="Bitcoin"
                width={20}
                height={20}
              />
            </div>
            <div>
              <div className="font-semibold text-sm text-(--text-main)">
                Bitcoin
              </div>
              <div className="font-mono text-[10px] text-(--text-muted)">
                bc1q...x8z2
              </div>
            </div>
          </div>
          <div className="text-right flex flex-col items-end">
            <div className="font-mono text-xs text-(--text-muted) mb-1">
              $0.00
            </div>
            <StatusPill variant="paused">Pending</StatusPill>
          </div>
        </div>
      </div>
    </Card>
  );
};
