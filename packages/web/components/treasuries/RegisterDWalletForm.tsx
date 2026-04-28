import { Button } from "@/components/global/Button";
import { Input } from "@/components/global/Input";
import { Modal } from "@/components/global/Modal";

export const RegisterDWalletForm = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register dWallet"
      className="max-w-2xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary">Register dWallet</Button>
        </div>
      }
    >
      <p className="text-[12px] text-(--text-muted) mb-8">
        Submit a real register_dwallet transaction.
      </p>
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
            >
              <option>Ethereum</option>
              <option>Solana</option>
              <option>Bitcoin</option>
              <option>Arbitrum</option>
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
          <Input label="dWallet ID" placeholder="DW-X-0192" />
        </div>
        <div className="md:col-span-2">
          <Input label="Address" placeholder="0x..." />
        </div>
        <div>
          <Input
            label="Balance USD cents"
            placeholder="4500000"
            type="number"
          />
        </div>
        <div>
          <Input label="Runtime dWallet account" placeholder="acc_8j2...9kx" />
        </div>
        <div>
          <Input label="Authorized user pubkey" placeholder="5u9...X7e" />
        </div>
        <div>
          <Input label="Message metadata digest" placeholder="sha256:..." />
        </div>
        <div className="md:col-span-2">
          <Input label="Public key hex" placeholder="04c8..." />
        </div>
      </div>
    </Modal>
  );
};
