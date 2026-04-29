import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/global/Button";
import { Input } from "@/components/global/Input";
import { Modal } from "@/components/global/Modal";
import {
  buildRegisterDwalletArgs,
  CHAINS,
  parsePublicKey,
  sendWalletInstructions,
} from "@/lib/aura-app";
import type { TreasuryEntry } from "@/lib/hooks";
import { useAuraClient } from "@/lib/hooks";

export const RegisterDWalletForm = ({
  isOpen,
  onClose,
  treasury,
}: {
  isOpen: boolean;
  onClose: () => void;
  treasury: TreasuryEntry;
}) => {
  const wallet = useWallet();
  const { connection } = useConnection();
  const client = useAuraClient();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    chain: String(CHAINS[2]?.code ?? 2),
    dwalletId: "",
    address: "",
    balanceUsd: "0",
    dwalletAccount: "",
    authorizedUserPubkey: "",
    messageMetadataDigest: "",
    publicKeyHex: "",
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setValidationError(null);
    }
  }, [isOpen]);

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey) {
        throw new Error("Connect a wallet first.");
      }

      const args = buildRegisterDwalletArgs({
        chain: Number(form.chain),
        dwalletId: form.dwalletId,
        address: form.address,
        balanceUsd: Number(form.balanceUsd),
        dwalletAccount: form.dwalletAccount
          ? parsePublicKey(form.dwalletAccount)
          : null,
        authorizedUserPubkey: form.authorizedUserPubkey
          ? parsePublicKey(form.authorizedUserPubkey)
          : null,
        messageMetadataDigest: form.messageMetadataDigest || null,
        publicKeyHex: form.publicKeyHex || null,
      });

      const instruction = await client.registerDwalletInstruction(
        { owner: wallet.publicKey, treasury: treasury.publicKey },
        args,
      );

      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["treasury", treasury.publicKey.toBase58()],
      });
      await queryClient.invalidateQueries({ queryKey: ["treasuries"] });
      setForm({
        chain: String(CHAINS[2]?.code ?? 2),
        dwalletId: "",
        address: "",
        balanceUsd: "0",
        dwalletAccount: "",
        authorizedUserPubkey: "",
        messageMetadataDigest: "",
        publicKeyHex: "",
      });
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!form.dwalletId.trim()) {
      setValidationError("dWallet ID is required.");
      return;
    }
    if (!form.address.trim()) {
      setValidationError("Address is required.");
      return;
    }
    setValidationError(null);
    registerMutation.mutate();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register dWallet"
      className="max-w-2xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={registerMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={registerMutation.isPending}
          >
            Register dWallet
          </Button>
        </div>
      }
    >
      <p className="text-[12px] text-(--text-muted) mb-8">
        Submit a real register_dwallet transaction.
      </p>
      {validationError ? (
        <div className="mb-4 rounded-sm border border-(--danger-border) bg-(--danger-bg) px-4 py-3 text-sm text-(--danger-text)">
          {validationError}
        </div>
      ) : null}
      {registerMutation.error instanceof Error ? (
        <div className="mb-4 rounded-sm border border-(--danger-border) bg-(--danger-bg) px-4 py-3 text-sm text-(--danger-text)">
          {registerMutation.error.message}
        </div>
      ) : null}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label
            htmlFor="chain-code"
            className="font-mono text-[10px] uppercase text-(--text-muted) font-bold mb-2 block"
          >
            Chain code
          </label>
          <div className="relative">
            <select
              id="chain-code"
              className="bg-(--input-bg) border border-border rounded-sm px-4 py-3 text-sm outline-none w-full transition-colors text-(--text-main) focus:border-primary appearance-none"
              value={form.chain}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  chain: event.target.value,
                }))
              }
              disabled={registerMutation.isPending}
            >
              {CHAINS.map((chain) => (
                <option key={chain.code} value={chain.code}>
                  {chain.label}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-(--text-muted)">
              <svg
                className="w-4 h-4 fill-current"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <title>Dropdown arrow</title>
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
        </div>
        <div>
          <Input
            label="dWallet ID"
            placeholder="DW-X-0192"
            value={form.dwalletId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                dwalletId: event.target.value,
              }))
            }
            disabled={registerMutation.isPending}
          />
        </div>
        <div className="md:col-span-2">
          <Input
            label="Address"
            placeholder="0x..."
            value={form.address}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                address: event.target.value,
              }))
            }
            disabled={registerMutation.isPending}
          />
        </div>
        <div>
          <Input
            label="Balance USD cents"
            placeholder="4500000"
            type="number"
            value={form.balanceUsd}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                balanceUsd: event.target.value,
              }))
            }
            disabled={registerMutation.isPending}
          />
        </div>
        <div>
          <Input
            label="Runtime dWallet account"
            placeholder="acc_8j2...9kx"
            value={form.dwalletAccount}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                dwalletAccount: event.target.value,
              }))
            }
            disabled={registerMutation.isPending}
          />
        </div>
        <div>
          <Input
            label="Authorized user pubkey"
            placeholder="5u9...X7e"
            value={form.authorizedUserPubkey}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                authorizedUserPubkey: event.target.value,
              }))
            }
            disabled={registerMutation.isPending}
          />
        </div>
        <div>
          <Input
            label="Message metadata digest"
            placeholder="sha256:..."
            value={form.messageMetadataDigest}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                messageMetadataDigest: event.target.value,
              }))
            }
            disabled={registerMutation.isPending}
          />
        </div>
        <div className="md:col-span-2">
          <Input
            label="Public key hex"
            placeholder="04c8..."
            value={form.publicKeyHex}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                publicKeyHex: event.target.value,
              }))
            }
            disabled={registerMutation.isPending}
          />
        </div>
      </div>
    </Modal>
  );
};
