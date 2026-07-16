import { redirect } from "next/navigation";
import { AuthGate } from "@/components/auth/AuthGate";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/dashboard");
  }

  return (
    <DashboardShell>
      <AuthGate>{children}</AuthGate>
    </DashboardShell>
  );
}
