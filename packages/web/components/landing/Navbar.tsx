"use client";

import { BookOpen, LogOut, Menu, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { AuthButton } from "@/components/auth/AuthButton";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import { Button } from "@/components/global/Button";
import { WALLET_APP_LINKS } from "@/components/global/WalletAccountMenu";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { DEFAULT_DOCS_URL } from "@/lib/settings";

// Landing page anchor links — shown when not connected
const LANDING_LINKS = [
  { label: "Problem", href: "#problem" },
  { label: "Control", href: "#control-plane" },
  { label: "Architecture", href: "#architecture" },
  { label: "Features", href: "#features" },
  { label: "FAQ", href: "#faq" },
];

export function Navbar() {
  const { resolvedTheme } = useTheme();
  const auth = useOwnerAuth();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const logoSrc =
    !mounted || resolvedTheme === "dark"
      ? "/dark-logo-wordmark.svg"
      : "/light-logo-wordmark.svg";

  const isDark = !mounted || resolvedTheme === "dark";
  const isAuthenticated = mounted && auth.isAuthenticated;
  const accountLabel = auth.user?.email ?? "AURA account";
  const docsUrl = DEFAULT_DOCS_URL;

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // Track nav ref for desktop nav
  const navRef = useRef<HTMLElement>(null);

  // All floating transition is pure CSS — no layout-triggering JS animation.
  // Only opacity/transform (composited) go through Framer Motion.
  const wrapperCls = [
    "fixed top-0 left-0 w-full z-[100] flex justify-center",
    "md:transition-[padding] md:duration-300 md:ease-[cubic-bezier(0.4,0,0.2,1)]",
    scrolled ? "pt-4 px-3 md:px-4" : "pt-3 px-3 md:pt-0 md:px-0",
  ].join(" ");

  const navCls = [
    "w-full flex justify-between items-center pointer-events-auto",
    "backdrop-blur-[16px]",
    "transition-[max-width,border-radius,padding,background-color,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
    scrolled
      ? isDark
        ? [
            "max-w-full px-5 py-3",
            mobileMenuOpen
              ? "rounded-tl-[14px] rounded-tr-[14px] rounded-bl-none rounded-br-none border-b-0"
              : "rounded-[14px]",
            "bg-[rgba(28,28,32,0.82)]",
            "border border-[rgba(255,255,255,0.12)]",
            "shadow-[0_8px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.07)]",
          ].join(" ")
        : [
            "max-w-full px-5 py-3",
            mobileMenuOpen
              ? "rounded-tl-[14px] rounded-tr-[14px] rounded-bl-none rounded-br-none border-b-0"
              : "rounded-[14px]",
            "bg-[rgba(255,255,255,0.72)]",
            "border border-[rgba(0,0,0,0.1)]",
            "shadow-[0_8px_40px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]",
          ].join(" ")
      : [
          "max-w-full rounded-none px-6 md:px-[4vw] py-5",
          "border-b border-t-0 border-l-0 border-r-0",
          isDark
            ? "bg-[rgba(28,28,32,0.82)] border-[rgba(255,255,255,0.12)] shadow-[0_8px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.07)]"
            : "bg-[rgba(255,255,255,0.72)] border-[rgba(0,0,0,0.1)] shadow-[0_8px_40px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]",
        ].join(" "),
  ].join(" ");

  return (
    <>
      {/* Option A — vignette gradient behind the pill zone, fades in on scroll */}
      <div
        className="fixed top-0 left-0 w-full h-40 pointer-events-none z-99 transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          opacity: scrolled ? 1 : 0,
          background: isDark
            ? "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 45%, transparent 100%)"
            : "linear-gradient(to bottom, rgba(160,160,180,1) 0%, rgba(160,160,180,0.45) 45%, transparent 100%)",
        }}
      />

      <div className={wrapperCls}>
        <nav ref={navRef} className={[navCls, "hidden md:flex"].join(" ")}>
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src={logoSrc}
              alt="AURA"
              width={96}
              height={24}
              style={{ width: "auto", height: "24px" }}
              suppressHydrationWarning
            />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex gap-6 items-center">
            {/* Landing links when logged out, minimal when logged in */}
            {!isAuthenticated &&
              LANDING_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) transition-colors"
            >
              Docs
            </a>

            <div className="h-4 w-px bg-border" />

            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button
                    variant="primary"
                    size="small"
                    className="font-mono! text-[10px]! uppercase! tracking-widest!"
                  >
                    Dashboard
                  </Button>
                </Link>

                <AuthButton />
              </>
            ) : (
              <Link href="/auth/login">
                <Button
                  variant="primary"
                  size="small"
                  className="font-mono! text-[10px]! uppercase! tracking-widest!"
                >
                  Launch
                </Button>
              </Link>
            )}

            <ThemeToggle />
          </div>

          {/* Mobile controls */}
          <div className="md:hidden flex items-center gap-3">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors relative size-8 flex items-center justify-center"
              aria-label="Toggle menu"
            >
              <AnimatePresence mode="wait" initial={false}>
                {mobileMenuOpen ? (
                  <m.span
                    key="x"
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0, rotate: -45, scale: 0.7 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: 45, scale: 0.7 }}
                    transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
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
                    transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <Menu className="size-4" />
                  </m.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </nav>

        {/* Mobile — single unified pill, expands in-place, no seam */}
        <div
          className={[
            "md:hidden w-full overflow-hidden rounded-[14px] backdrop-blur-[16px]",
            "transition-[background-color,border-color,box-shadow] duration-300",
            isDark
              ? "bg-[rgba(28,28,32,0.82)] border border-[rgba(255,255,255,0.12)] shadow-[0_8px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.07)]"
              : "bg-[rgba(255,255,255,0.72)] border border-[rgba(0,0,0,0.1)] shadow-[0_8px_40px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]",
          ].join(" ")}
        >
          {/* Top bar row */}
          <div className="flex justify-between items-center px-5 py-3">
            <Link href="/" className="flex items-center shrink-0">
              <Image
                src={logoSrc}
                alt="AURA"
                width={96}
                height={24}
                style={{ width: "auto", height: "24px" }}
                suppressHydrationWarning
              />
            </Link>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-1.5 rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors relative size-8 flex items-center justify-center"
                aria-label="Toggle menu"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {mobileMenuOpen ? (
                    <m.span
                      key="x"
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ opacity: 0, rotate: -45, scale: 0.7 }}
                      animate={{ opacity: 1, rotate: 0, scale: 1 }}
                      exit={{ opacity: 0, rotate: 45, scale: 0.7 }}
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
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
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <Menu className="size-4" />
                    </m.span>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </div>

          {/* Expandable body — same element, zero seam */}
          <AnimatePresence initial={false}>
            {mobileMenuOpen && (
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
                style={{ willChange: "height" }}
              >
                <div
                  className={
                    isDark
                      ? "mx-3 border-t border-[rgba(255,255,255,0.08)]"
                      : "mx-3 border-t border-[rgba(0,0,0,0.08)]"
                  }
                />
                <div className="flex flex-col p-3 gap-1">
                  {isAuthenticated ? (
                    <>
                      <div className="flex items-center gap-2 px-3 py-2">
                        <div className="size-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                        <span className="font-mono text-[10px] text-(--text-muted) truncate">
                          {accountLabel}
                        </span>
                      </div>

                      {WALLET_APP_LINKS.map(({ label, href, icon: Icon }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors"
                        >
                          <Icon className="size-3.5 shrink-0" />
                          <span className="font-mono text-[11px] uppercase tracking-widest">
                            {label}
                          </span>
                        </Link>
                      ))}

                      <div className="my-1 border-t border-border" />

                      <a
                        href={docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors"
                      >
                        <BookOpen className="size-3.5 shrink-0" />
                        <span className="font-mono text-[11px] uppercase tracking-widest">
                          Docs
                        </span>
                      </a>

                      <div className="my-1 border-t border-border" />

                      <button
                        type="button"
                        onClick={() => {
                          void auth.signOut();
                          setMobileMenuOpen(false);
                        }}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-danger hover:bg-danger/10 transition-colors w-full text-left"
                      >
                        <LogOut className="size-3.5 shrink-0" />
                        <span className="text-xs">Disconnect</span>
                      </button>
                    </>
                  ) : (
                    <>
                      {LANDING_LINKS.map(({ label, href }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setMobileMenuOpen(false)}
                          className="font-mono text-[11px] uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) px-3 py-2.5 rounded-md transition-colors block"
                        >
                          {label}
                        </Link>
                      ))}
                      <a
                        href={docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors"
                      >
                        <BookOpen className="size-3.5 shrink-0" />
                        <span className="font-mono text-[11px] uppercase tracking-widest">
                          Docs
                        </span>
                      </a>

                      <div className="my-1 border-t border-border" />

                      <div className="px-1 pb-1">
                        <Link
                          href="/auth/login"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <Button
                            variant="primary"
                            className="font-mono! w-full! text-[11px]! uppercase! tracking-widest!"
                          >
                            Launch
                          </Button>
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Backdrop */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <m.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[39] md:hidden bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
