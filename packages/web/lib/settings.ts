"use client";

import type { PublicKey } from "@solana/web3.js";
import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface AppSettingsContextValue {
  network: "devnet" | "mainnet-beta";
  endpoint: string;
  customRpcUrl: string;
  programId: string;
  resolvedProgramId?: PublicKey;
  nimApiKey: string;
  currency: string;
  dateFormat: string;
  setNetwork: Dispatch<SetStateAction<"devnet" | "mainnet-beta">>;
  setCustomRpcUrl: Dispatch<SetStateAction<string>>;
  setProgramId: Dispatch<SetStateAction<string>>;
  setNimApiKey: Dispatch<SetStateAction<string>>;
  setCurrency: Dispatch<SetStateAction<string>>;
  setDateFormat: Dispatch<SetStateAction<string>>;
}

const Context = createContext<AppSettingsContextValue | null>(null);

export const AppSettingsContext = Object.assign(Context, {
  useValue(): AppSettingsContextValue {
    const value = useContext(Context);
    if (!value) {
      throw new Error("AppSettingsContext is missing");
    }
    return value;
  },
});

export function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return;
    }
    try {
      setValue(JSON.parse(raw) as T);
    } catch {
      window.localStorage.removeItem(key);
    }
  }, [key]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return useMemo(() => [value, setValue] as const, [value]);
}
