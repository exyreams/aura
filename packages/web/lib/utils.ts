import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenAddress(address: string, left = 4, right = 4) {
  if (address.length <= left + right + 3) {
    return address;
  }

  return `${address.slice(0, left)}...${address.slice(-right)}`;
}
