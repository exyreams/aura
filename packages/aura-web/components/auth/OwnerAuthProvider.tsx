"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { Database, Profile } from "@/lib/supabase/types";

interface OwnerAuthContextValue {
  supabase: SupabaseClient<Database>;
  session: Session | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSigningIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const OwnerAuthContext = createContext<OwnerAuthContextValue | null>(null);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected auth error.";
}

export function OwnerAuthProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setProfile(null);
      return;
    }

    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    setProfile(data);
  }, [supabase]);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) {
          return;
        }
        setSession(data.session);
        if (data.session) {
          await refreshProfile();
        }
      })
      .catch((cause: unknown) => {
        if (mounted) {
          setError(getErrorMessage(cause));
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
      } else {
        void refreshProfile();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshProfile, supabase]);

  const signIn = useCallback(async () => {
    setError(null);

    if (!wallet.publicKey) {
      setError("Connect a Solana wallet before signing in.");
      return;
    }

    if (!wallet.signMessage) {
      setError("The connected wallet does not support message signing.");
      return;
    }

    setIsSigningIn(true);
    try {
      const signMessage = wallet.signMessage.bind(wallet);
      const walletForAuth = {
        publicKey: wallet.publicKey,
        signMessage(message: Uint8Array, encoding?: string) {
          void encoding;
          return signMessage(message);
        },
      };

      const { data, error: signInError } = await supabase.auth.signInWithWeb3({
        chain: "solana",
        statement: "Sign in to AURA Control Center.",
        wallet: walletForAuth,
      });

      if (signInError) {
        throw signInError;
      }

      const userId = data.user.id;
      const walletAddress = wallet.publicKey.toBase58();

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        wallet_address: walletAddress,
      });

      if (profileError) {
        throw profileError;
      }

      await refreshProfile();
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setIsSigningIn(false);
    }
  }, [refreshProfile, supabase, wallet]);

  const signOut = useCallback(async () => {
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
    }
    setProfile(null);
  }, [supabase]);

  const value = useMemo<OwnerAuthContextValue>(
    () => ({
      supabase,
      session,
      profile,
      isAuthenticated: Boolean(session && profile),
      isLoading,
      isSigningIn,
      error,
      signIn,
      signOut,
      refreshProfile,
    }),
    [
      error,
      isLoading,
      isSigningIn,
      profile,
      refreshProfile,
      session,
      signIn,
      signOut,
      supabase,
    ],
  );

  return (
    <OwnerAuthContext.Provider value={value}>
      {children}
    </OwnerAuthContext.Provider>
  );
}

export function useOwnerAuth() {
  const value = use(OwnerAuthContext);
  if (!value) {
    throw new Error("OwnerAuthProvider is missing.");
  }
  return value;
}
