"use client";

import {
  FullSearchTrigger,
  SearchTrigger,
} from "fumadocs-ui/layouts/shared/slots/search-trigger";
import { ThemeSwitch } from "fumadocs-ui/layouts/shared/slots/theme-switch";
import { Menu, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const LINKS = [
  { label: "Introduction", href: "/docs/overview" },
  { label: "Program", href: "/docs/program" },
  { label: "TypeScript SDK", href: "/docs/sdk-ts" },
  { label: "Rust SDK", href: "/docs/sdk-rs" },
  { label: "CLI", href: "/docs/cli" },
];

export function DocsNav() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const isDark = !mounted || resolvedTheme === "dark";
  const logoSrc = isDark
    ? "/dark-logo-wordmark.svg"
    : "/light-logo-wordmark.svg";

  const wrapperCls = [
    "fixed top-0 left-0 w-full z-40 flex justify-center",
    "transition-[padding] duration-300 ease-in-out",
    scrolled ? "pt-4 px-3 md:px-4" : "pt-0 px-0",
  ].join(" ");

  const navBase = [
    "w-full flex justify-between items-center pointer-events-auto",
    "backdrop-blur-lg",
    "transition-[max-width,border-radius,padding,background-color,box-shadow,border-color] duration-300 ease-in-out",
  ].join(" ");

  const pillDark =
    "bg-[rgba(28,28,32,0.82)] border border-[rgba(255,255,255,0.12)] shadow-[0_8px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.07)]";
  const pillLight =
    "bg-[rgba(255,255,255,0.72)] border border-[rgba(0,0,0,0.1)] shadow-[0_8px_40px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]";
  const pill = isDark ? pillDark : pillLight;

  const roundedPill = mobileOpen
    ? "rounded-tl-[14px] rounded-tr-[14px] rounded-bl-none rounded-br-none border-b-0"
    : "rounded-[14px]";

  const navScrolled = `max-w-full px-5 py-3 ${roundedPill} ${pill}`;
  const navFlat = isDark
    ? `max-w-full rounded-none px-6 md:px-[4vw] py-5 border-b border-[rgba(255,255,255,0.08)] ${pillDark}`
    : `max-w-full rounded-none px-6 md:px-[4vw] py-5 border-b border-[rgba(0,0,0,0.08)] ${pillLight}`;

  const navCls = `${navBase} ${scrolled ? navScrolled : navFlat}`;

  const GitHubIcon = () => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-label="GitHub"
    >
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );

  const MenuButton = () => (
    <button
      type="button"
      onClick={() => setMobileOpen(!mobileOpen)}
      className="p-1.5 rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors relative size-8 flex items-center justify-center"
    >
      <AnimatePresence mode="wait" initial={false}>
        {mobileOpen ? (
          <m.span
            key="x"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, rotate: -45, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 45, scale: 0.7 }}
            transition={{ duration: 0.18 }}
          >
            <X className="size-4" />
          </m.span>
        ) : (
          <m.span
            key="menu"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, rotate: 45, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: -45, scale: 0.7 }}
            transition={{ duration: 0.18 }}
          >
            <Menu className="size-4" />
          </m.span>
        )}
      </AnimatePresence>
    </button>
  );

  return (
    <>
      {/* Vignette */}
      <div
        className="fixed top-0 left-0 w-full h-40 pointer-events-none z-39 transition-opacity duration-300"
        style={{
          opacity: scrolled ? 1 : 0,
          background: isDark
            ? "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 45%, transparent 100%)"
            : "linear-gradient(to bottom, rgba(249,250,251,1) 0%, rgba(249,250,251,0.45) 45%, transparent 100%)",
        }}
      />

      <div className={wrapperCls}>
        {/* Desktop */}
        <nav className={`${navCls} hidden md:flex`}>
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src={logoSrc}
              alt="AURA"
              width={80}
              height={20}
              className="h-5 w-auto"
              suppressHydrationWarning
            />
          </Link>
          <div className="flex items-center gap-5">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) transition-colors"
              >
                {l.label}
              </Link>
            ))}
            <div className="h-4 w-px bg-(--border)" />
            <FullSearchTrigger />
            <ThemeSwitch />
            <Link
              href="https://github.com/exyreams/aura"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-(--text-muted) transition-colors hover:text-(--text-main)"
            >
              <GitHubIcon />
              AURA
            </Link>
          </div>
        </nav>

        {/* Mobile pill */}
        <div
          className={`md:hidden w-full overflow-hidden rounded-[14px] backdrop-blur-lg ${pill}`}
        >
          <div className="flex justify-between items-center px-5 py-3">
            <Link href="/" className="flex items-center shrink-0">
              <Image
                src={logoSrc}
                alt="AURA"
                width={80}
                height={20}
                className="h-5 w-auto"
                suppressHydrationWarning
              />
            </Link>
            <div className="flex items-center gap-2">
              <SearchTrigger />
              <ThemeSwitch />
              <MenuButton />
            </div>
          </div>

          <AnimatePresence initial={false}>
            {mobileOpen && (
              <m.div
                key="body"
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 340,
                  damping: 34,
                  mass: 0.7,
                }}
                className="overflow-hidden"
              >
                <div
                  className={`mx-3 border-t ${isDark ? "border-[rgba(255,255,255,0.08)]" : "border-[rgba(0,0,0,0.08)]"}`}
                />
                <div className="flex flex-col p-3 gap-1">
                  {LINKS.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setMobileOpen(false)}
                      className="font-mono text-[11px] uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) px-3 py-2.5 rounded-md transition-colors block"
                    >
                      {l.label}
                    </Link>
                  ))}
                  <div className="my-1 border-t border-(--border)" />
                  <Link
                    href="https://github.com/exyreams/aura"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors font-mono text-[11px] uppercase tracking-widest"
                  >
                    GitHub
                  </Link>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <m.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-39 md:hidden bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
