import { shortenAddress } from "@/lib/utils";

export function formatAddress(address: string) {
  return shortenAddress(address, 5, 5);
}
