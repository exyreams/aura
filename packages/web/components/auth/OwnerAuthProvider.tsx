"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import bs58 from "bs58";
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
import type { AccountWallet, Database, Profile } from "@/lib/supabase/types";

interface AuthResult {
  message: string;
}

type SignOutScope = "global" | "local" | "others";

interface OwnerAuthContextValue {
  supabase: SupabaseClient<Database>;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  accountWallets: AccountWallet[];
  primaryWallet: AccountWallet | null;
  isAuthenticated: boolean;
  needsWalletLink: boolean;
  isLoading: boolean;
  isSigningIn: boolean;
  isSubmitting: boolean;
  isLinkingWallet: boolean;
  error: string | null;
  signUpWithPassword: (email: string, password: string) => Promise<AuthResult>;
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  signInWithMagicLink: (email: string) => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  changePassword: (
    currentPassword: string,
    nextPassword: string,
  ) => Promise<AuthResult>;
  requestEmailChange: (email: string) => Promise<AuthResult>;
  updateProfile: (input: { displayName: string }) => Promise<AuthResult>;
  linkConnectedWallet: () => Promise<void>;
  setPrimaryWallet: (walletId: string) => Promise<void>;
  unlinkWallet: (walletId: string) => Promise<void>;
  signOut: (scope?: SignOutScope) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

interface AccountPayload {
  user: {
    id: string;
    email?: string | null;
    emailConfirmedAt?: string | null;
  };
  profile: Profile;
  wallets: AccountWallet[];
}

interface ChallengePayload {
  challengeId: string;
  message: string;
  expiresAt: string;
}

const OwnerAuthContext = createContext<OwnerAuthContextValue | null>(null);

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected auth error.";
}

async function readJson<T>(response: Response) {
  const body = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? "Request failed.");
  }

  return body;
}

function getCallbackUrl(next: string) {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", next);
  return url.toString();
}

function getEmailRedirectUrl(next: string) {
  return getCallbackUrl(next);
}

export function OwnerAuthProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accountWallets, setAccountWallets] = useState<AccountWallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLinkingWallet, setIsLinkingWallet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    const response = await fetch("/api/auth/profile", {
      method: "GET",
      credentials: "same-origin",
    });
    const payload = await readJson<AccountPayload>(response);

    setProfile(payload.profile);
    setAccountWallets(payload.wallets);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) {
          return;
        }

        setSession(data.session);
        setUser(data.session?.user ?? null);

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
      setUser(nextSession?.user ?? null);

      if (!nextSession) {
        setProfile(null);
        setAccountWallets([]);
      } else {
        void refreshProfile().catch((cause: unknown) => {
          setError(getErrorMessage(cause));
        });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshProfile, supabase]);

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setIsSubmitting(true);
      try {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getEmailRedirectUrl("/dashboard/settings"),
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        if (data.session) {
          setSession(data.session);
          setUser(data.user);
          await refreshProfile();
        }

        return {
          message: "Account created.",
        };
      } catch (cause) {
        const message = getErrorMessage(cause);
        setError(message);
        throw new Error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [refreshProfile, supabase],
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setIsSigningIn(true);
      try {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          throw signInError;
        }

        await refreshProfile();
        return { message: "Signed in." };
      } catch (cause) {
        const message = getErrorMessage(cause);
        setError(message);
        throw new Error(message);
      } finally {
        setIsSigningIn(false);
      }
    },
    [refreshProfile, supabase],
  );

  const signInWithMagicLink = useCallback(
    async (email: string) => {
      setError(null);
      setIsSubmitting(true);
      try {
        const { error: magicLinkError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: getEmailRedirectUrl("/dashboard"),
          },
        });

        if (magicLinkError) {
          throw magicLinkError;
        }

        return { message: "Check your email for a magic sign-in link." };
      } catch (cause) {
        const message = getErrorMessage(cause);
        setError(message);
        throw new Error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [supabase],
  );

  const sendPasswordReset = useCallback(
    async (email: string) => {
      setError(null);
      setIsSubmitting(true);
      try {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: getEmailRedirectUrl("/auth/reset"),
          },
        );

        if (resetError) {
          throw resetError;
        }

        return { message: "Check your email for a password reset link." };
      } catch (cause) {
        const message = getErrorMessage(cause);
        setError(message);
        throw new Error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [supabase],
  );

  const updatePassword = useCallback(
    async (password: string) => {
      setError(null);
      setIsSubmitting(true);
      try {
        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });

        if (updateError) {
          throw updateError;
        }

        await refreshProfile();
        return { message: "Password updated." };
      } catch (cause) {
        const message = getErrorMessage(cause);
        setError(message);
        throw new Error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [refreshProfile, supabase],
  );

  const changePassword = useCallback(
    async (currentPassword: string, nextPassword: string) => {
      if (!user?.email) {
        throw new Error("This account does not have an email address.");
      }

      setError(null);
      setIsSubmitting(true);
      try {
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });

        if (reauthError) {
          throw reauthError;
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password: nextPassword,
        });

        if (updateError) {
          throw updateError;
        }

        await refreshProfile();
        return { message: "Password changed." };
      } catch (cause) {
        const message = getErrorMessage(cause);
        setError(message);
        throw new Error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [refreshProfile, supabase, user?.email],
  );

  const requestEmailChange = useCallback(
    async (email: string) => {
      setError(null);
      setIsSubmitting(true);
      try {
        const { error: updateError } = await supabase.auth.updateUser(
          { email },
          { emailRedirectTo: getEmailRedirectUrl("/dashboard/settings") },
        );

        if (updateError) {
          throw updateError;
        }

        return {
          message:
            "Email change requested. Check the new address if confirmation is required.",
        };
      } catch (cause) {
        const message = getErrorMessage(cause);
        setError(message);
        throw new Error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [supabase],
  );

  const updateProfile = useCallback(
    async ({ displayName }: { displayName: string }) => {
      setError(null);
      setIsSubmitting(true);
      try {
        const response = await fetch("/api/auth/profile", {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ displayName }),
        });
        const payload = await readJson<{ profile: Profile }>(response);
        setProfile(payload.profile);
        return { message: "Profile saved." };
      } catch (cause) {
        const message = getErrorMessage(cause);
        setError(message);
        throw new Error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  const linkConnectedWallet = useCallback(async () => {
    setError(null);

    if (!wallet.publicKey) {
      const message = "Connect a Solana wallet before linking it.";
      setError(message);
      throw new Error(message);
    }

    if (!wallet.signMessage) {
      const message = "The connected wallet does not support message signing.";
      setError(message);
      throw new Error(message);
    }

    setIsLinkingWallet(true);
    try {
      const walletAddress = wallet.publicKey.toBase58();
      const challengeResponse = await fetch("/api/auth/wallets/challenge", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ walletAddress }),
      });
      const challenge = await readJson<ChallengePayload>(challengeResponse);
      const messageBytes = new TextEncoder().encode(challenge.message);
      const signatureBytes = await wallet.signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);

      const linkResponse = await fetch("/api/auth/wallets/link", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          walletAddress,
          signature,
        }),
      });
      await readJson<{ wallet: AccountWallet }>(linkResponse);
      await refreshProfile();
    } catch (cause) {
      const message = getErrorMessage(cause);
      setError(message);
      throw new Error(message);
    } finally {
      setIsLinkingWallet(false);
    }
  }, [refreshProfile, wallet]);

  const setPrimaryWallet = useCallback(
    async (walletId: string) => {
      setError(null);
      const response = await fetch(`/api/auth/wallets/${walletId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isPrimary: true }),
      });
      await readJson<{ wallet: AccountWallet }>(response);
      await refreshProfile();
    },
    [refreshProfile],
  );

  const unlinkWallet = useCallback(
    async (walletId: string) => {
      setError(null);
      const response = await fetch(`/api/auth/wallets/${walletId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      await readJson<{ ok: boolean }>(response);
      await refreshProfile();
    },
    [refreshProfile],
  );

  const signOut = useCallback(
    async (scope: SignOutScope = "global") => {
      setError(null);
      const { error: signOutError } = await supabase.auth.signOut({ scope });
      if (signOutError) {
        setError(signOutError.message);
        throw signOutError;
      }

      if (scope !== "others") {
        setSession(null);
        setUser(null);
        setProfile(null);
        setAccountWallets([]);
      }
    },
    [supabase],
  );

  const primaryWallet =
    accountWallets.find(
      (walletLink) => walletLink.id === profile?.primary_wallet_id,
    ) ??
    accountWallets.find((walletLink) => walletLink.is_primary) ??
    null;

  const value = useMemo<OwnerAuthContextValue>(
    () => ({
      supabase,
      session,
      user,
      profile,
      accountWallets,
      primaryWallet,
      isAuthenticated: Boolean(session && profile),
      needsWalletLink: Boolean(session && profile && !primaryWallet),
      isLoading,
      isSigningIn,
      isSubmitting,
      isLinkingWallet,
      error,
      signUpWithPassword,
      signInWithPassword,
      signInWithMagicLink,
      sendPasswordReset,
      updatePassword,
      changePassword,
      requestEmailChange,
      updateProfile,
      linkConnectedWallet,
      setPrimaryWallet,
      unlinkWallet,
      signOut,
      refreshProfile,
    }),
    [
      accountWallets,
      changePassword,
      error,
      isLinkingWallet,
      isLoading,
      isSigningIn,
      isSubmitting,
      linkConnectedWallet,
      primaryWallet,
      profile,
      refreshProfile,
      requestEmailChange,
      sendPasswordReset,
      session,
      setPrimaryWallet,
      signInWithMagicLink,
      signInWithPassword,
      signOut,
      signUpWithPassword,
      supabase,
      unlinkWallet,
      updatePassword,
      updateProfile,
      user,
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
