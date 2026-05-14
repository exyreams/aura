import { DocsNav } from "@/components/DocsNav";
import { DocsFooter } from "@/components/DocsFooter";

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-col min-h-screen">
      <DocsNav />
      <main className="flex-1">{children}</main>
      <DocsFooter />
    </div>
  );
}
