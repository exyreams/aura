"use client";

import type { PublicKey } from "@solana/web3.js";
import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface AppSettingsContextValue {
  network: "devnet" | "mainnet-beta";
  endpoint: string;
  customRpcUrl: string;
  programId: string;
  resolvedProgramId?: PublicKey;
  backendUrl: string;
  backendAuthToken: string;
  nimApiKey: string;
  currency: string;
  dateFormat: string;
  setNetwork: Dispatch<SetStateAction<"devnet" | "mainnet-beta">>;
  setCustomRpcUrl: Dispatch<SetStateAction<string>>;
  setProgramId: Dispatch<SetStateAction<string>>;
  setBackendUrl: Dispatch<SetStateAction<string>>;
  setBackendAuthToken: Dispatch<SetStateAction<string>>;
  setNimApiKey: Dispatch<SetStateAction<string>>;
  setCurrency: Dispatch<SetStateAction<string>>;
  setDateFormat: Dispatch<SetStateAction<string>>;
}

const Context = createContext<AppSettingsContextValue | null>(null);
export const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_AURA_BACKEND_URL?.trim() || "http://127.0.0.1:8787";
export const DEFAULT_DOCS_URL =
  process.env.NEXT_PUBLIC_DOCS_URL?.trim() || "http://127.0.0.1:3001";

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
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      hasLoaded.current = true;
      return;
    }
    try {
      setValue(JSON.parse(raw) as T);
    } catch {
      window.localStorage.removeItem(key);
    } finally {
      hasLoaded.current = true;
    }
  }, [key]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoaded.current) {
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== key) {
        return;
      }
      if (event.newValue === null) {
        setValue(initialValue);
        return;
      }
      try {
        setValue(JSON.parse(event.newValue) as T);
      } catch {
        window.localStorage.removeItem(key);
        setValue(initialValue);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [initialValue, key]);

  return useMemo(() => [value, setValue] as const, [value]);
}
