"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseBrowserEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

export function createBrowserSupabaseClient() {
  const { url, publishableKey } = getSupabaseBrowserEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
