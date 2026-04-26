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
      <main className="flex-1 mt-[73px] p-8 lg:p-12">{children}</main>
      <DashboardFooter />
    </div>
  );
}
