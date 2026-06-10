"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useEffect, useId, useRef, useState } from "react";

const MermaidModal = dynamic(
  () => import("./mermaid-modal").then((m) => m.MermaidModal),
  { ssr: false },
);

export function Mermaid({ chart }: { chart: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return <MermaidContent chart={chart} />;
}

// Bump to bust mermaid's internal render cache when themeVariables change
const THEME_VERSION = "v5";

function MermaidContent({ chart }: { chart: string }) {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLButtonElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    import("mermaid").then(({ default: mermaid }) => {
      const dark = resolvedTheme === "dark";

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        // neutral gives the clean grey-box look from the screenshot
        theme: "neutral",
        themeVariables: dark
          ? {
              // Match the clean grey aesthetic but dark
              background: "#0c0c0e",
              mainBkg: "#1e1e22",
              primaryColor: "#1e1e22",
              secondaryColor: "#252528",
              tertiaryColor: "#252528",
              primaryBorderColor: "#3a3a40",
              secondaryBorderColor: "#2e2e34",
              tertiaryBorderColor: "#2e2e34",
              nodeBorder: "#3a3a40",
              primaryTextColor: "#e5e7eb",
              secondaryTextColor: "#9ca3af",
              tertiaryTextColor: "#9ca3af",
              textColor: "#e5e7eb",
              titleColor: "#9ca3af",
              lineColor: "#6b7280",
              edgeLabelBackground: "#0c0c0e",
              clusterBkg: "#141416",
              clusterBorder: "#2e2e34",
              // Sequence actors — same box style as nodes
              actorBkg: "#1e1e22",
              actorBorder: "#3a3a40",
              actorTextColor: "#e5e7eb",
              actorLineColor: "#3a3a40",
              signalColor: "#6b7280",
              signalTextColor: "#d1d5db",
              labelBoxBkgColor: "#1e1e22",
              labelBoxBorderColor: "#3a3a40",
              labelTextColor: "#d1d5db",
              loopTextColor: "#9ca3af",
              noteBkgColor: "#252528",
              noteBorderColor: "#2e2e34",
              noteTextColor: "#9ca3af",
              activationBkgColor: "#252528",
              activationBorderColor: "#3a3a40",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "13px",
            }
          : {
              // Match the clean grey aesthetic but light
              background: "#ffffff",
              mainBkg: "#f9fafb",
              primaryColor: "#f9fafb",
              secondaryColor: "#f3f4f6",
              tertiaryColor: "#f3f4f6",
              primaryBorderColor: "#e5e7eb",
              secondaryBorderColor: "#e5e7eb",
              tertiaryBorderColor: "#e5e7eb",
              nodeBorder: "#cbd5e1",
              primaryTextColor: "#111827",
              secondaryTextColor: "#4b5563",
              tertiaryTextColor: "#4b5563",
              textColor: "#111827",
              titleColor: "#111827",
              lineColor: "#9ca3af",
              edgeLabelBackground: "#f9fafb",
              clusterBkg: "#f8fafc",
              clusterBorder: "#e2e8f0",
              actorBkg: "#ffffff",
              actorBorder: "#cbd5e1",
              actorTextColor: "#111827",
              actorLineColor: "#cbd5e1",
              signalColor: "#4b5563",
              signalTextColor: "#111827",
              labelBoxBkgColor: "#f9fafb",
              labelBoxBorderColor: "#cbd5e1",
              labelTextColor: "#111827",
              loopTextColor: "#4b5563",
              noteBkgColor: "#f3f4f6",
              noteBorderColor: "#cbd5e1",
              noteTextColor: "#4b5563",
              activationBkgColor: "#f1f5f9",
              activationBorderColor: "#cbd5e1",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "13px",
            },
      });

      const renderId = `mermaid-${THEME_VERSION}-${id}-${Date.now()}`.replace(
        /[^a-zA-Z0-9-]/g,
        "",
      );

      mermaid
        .render(renderId, chart.replaceAll("\\n", "\n"))
        .then(({ svg: rendered, bindFunctions }) => {
          if (cancelled) return;
          setSvg(rendered);
          requestAnimationFrame(() => {
            if (containerRef.current) bindFunctions?.(containerRef.current);
          });
        })
        .catch(console.error);
    });

    return () => {
      cancelled = true;
    };
  }, [chart, resolvedTheme, id]);

  if (!svg) return null;

  return (
    <>
      <button
        type="button"
        ref={containerRef}
        className="aura-mermaid"
        title="Click to enlarge"
        tabIndex={0}
        style={{
          cursor: "zoom-in",
          background: "none",
          border: "none",
          padding: 0,
          width: "100%",
          textAlign: "left",
        }}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid renders its own sanitized SVG
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {open && <MermaidModal svg={svg} onClose={() => setOpen(false)} />}
    </>
  );
}
