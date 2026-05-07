import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { LayoutTab } from "fumadocs-ui/layouts/shared";
import { BookOpen, Box, Code, Globe, Server, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

// Icons and descriptions keyed by the root folder title
const TAB_META: Record<string, { icon: ReactNode; description: string }> = {
  Architecture: {
    icon: <BookOpen className="size-4" />,
    description: "System design & overview",
  },
  "Web App": {
    icon: <Globe className="size-4" />,
    description: "Frontend web interface",
  },
  "Backend API": {
    icon: <Server className="size-4" />,
    description: "REST & gRPC services",
  },
  "TypeScript SDK": {
    icon: <Code className="size-4" />,
    description: "JS/TS client library",
  },
  "Rust SDK": {
    icon: <Box className="size-4" />,
    description: "Native Rust client",
  },
  "CLI Tool": {
    icon: <Terminal className="size-4" />,
    description: "Command-line interface",
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      tabs={{
        transform(option: LayoutTab) {
          const meta = TAB_META[option.title as string];
          if (!meta) return option;
          return {
            ...option,
            icon: meta.icon,
            description: meta.description,
          };
        },
      }}
      {...baseOptions()}
    >
      {children}
    </DocsLayout>
  );
}
