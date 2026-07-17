import { LinkIcon, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/global/Button";
import { StatusBadge } from "@/components/global/StatusBadge";
import { WalletAccountMenu } from "@/components/global/WalletAccountMenu";
import {
  CopyButton,
  Notice,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/SettingsPrimitives";
import { formatDateTime } from "@/components/settings/utils";
import type { AccountWallet } from "@/lib/supabase/types";
import { shortenAddress } from "@/lib/utils";

export function WalletSettingsSection({
  wallets,
  walletError,
  hasConnectedWallet,
  isLinkingWallet,
  onLinkWallet,
  onSetPrimaryWallet,
  onUnlinkWallet,
}: {
  wallets: AccountWallet[];
  walletError: string | null;
  hasConnectedWallet: boolean;
  isLinkingWallet: boolean;
  onLinkWallet: () => void;
  onSetPrimaryWallet: (walletId: string) => void;
  onUnlinkWallet: (walletId: string) => void;
}) {
  return (
    <SettingsSection
      id="wallets"
      icon={Wallet}
      eyebrow="Wallets"
      title="Owner wallets"
      description="Wallet links require a signed Solana message. The primary wallet is used for owner approvals."
    >
      <div className="grid gap-0">
        <SettingsRow
          label="Linked wallets"
          description="Owner wallets attached to this email account."
        >
          {walletError ? <Notice tone="danger">{walletError}</Notice> : null}

          <div className={walletError ? "mt-4" : ""}>
            {wallets.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
                <Wallet
                  className="mx-auto size-6 text-muted-foreground"
                  aria-hidden="true"
                />
                <h3 className="mt-3 text-sm font-semibold">
                  No owner wallet linked
                </h3>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  Connect a Solana wallet and sign the link challenge before
                  approving Conduit agents or creating owner-bound dWallets.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                {wallets.map((linkedWallet) => (
                  <div
                    key={linkedWallet.id}
                    className="flex flex-col gap-3 border-border border-t p-4 first:border-t-0 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm">
                          {shortenAddress(linkedWallet.wallet_address, 6, 6)}
                        </p>
                        {linkedWallet.is_primary ? (
                          <StatusBadge tone="success">Primary</StatusBadge>
                        ) : null}
                        <StatusBadge tone="neutral">
                          {linkedWallet.chain_name}
                        </StatusBadge>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <p className="min-w-0 break-all font-mono text-[10px] text-muted-foreground">
                          {linkedWallet.wallet_address}
                        </p>
                        <CopyButton
                          value={linkedWallet.wallet_address}
                          label="Copy wallet address"
                        />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Linked {formatDateTime(linkedWallet.linked_at)} · Last
                        verified {formatDateTime(linkedWallet.last_verified_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="small"
                        disabled={linkedWallet.is_primary}
                        onClick={() => onSetPrimaryWallet(linkedWallet.id)}
                      >
                        Set primary
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="small"
                        onClick={() => onUnlinkWallet(linkedWallet.id)}
                        icon={<Trash2 className="size-3" aria-hidden="true" />}
                      >
                        Unlink
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SettingsRow>

        <SettingsRow
          label="Link wallet"
          description="Connect a wallet and sign a challenge to attach it to this account."
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <WalletAccountMenu
              connectLabel="Connect wallet"
              showAppNavigation={false}
            />
            <Button
              type="button"
              variant="primary"
              onClick={onLinkWallet}
              disabled={!hasConnectedWallet || isLinkingWallet}
              loading={isLinkingWallet}
              icon={<LinkIcon className="size-3" aria-hidden="true" />}
            >
              Link wallet
            </Button>
          </div>
        </SettingsRow>
      </div>
    </SettingsSection>
  );
}
