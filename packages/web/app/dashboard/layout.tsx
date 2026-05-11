import { AuthGate } from "@/components/global/AuthGate";
import { DashboardFooter } from "@/components/layout/DashboardFooter";
import { DashboardNav } from "@/components/layout/DashboardNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <DashboardNav />
      <main className="flex-1 mt-[85px] md:mt-[73px] p-8 lg:p-12">
        <AuthGate>{children}</AuthGate>
      </main>
      <DashboardFooter />
    </div>
  );
}
