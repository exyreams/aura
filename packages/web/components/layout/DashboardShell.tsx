"use client";

import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  X,
} from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AuthButton } from "@/components/auth/AuthButton";
import { StatusBadge } from "@/components/global/StatusBadge";
import { Tooltip } from "@/components/global/Tooltip";
import {
  Activity,
  Agent,
  Documentations,
  LayoutDashboard,
  Settings,
  Shield,
  Wallet,
} from "@/components/icons";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { DEFAULT_DOCS_URL } from "@/lib/settings";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  description?: string;
  icon: SidebarIcon;
  animated?: boolean;
  exact?: boolean;
  external?: boolean;
  badge?: string;
}

interface SidebarIconProps {
  className?: string;
  size?: number;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
}

interface AnimatedSidebarIconProps extends SidebarIconProps {
  animateOnHover?: boolean;
}

type SidebarIcon = ComponentType<SidebarIconProps>;

const primaryNav: NavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    description: "Control center summary",
    icon: LayoutDashboard,
    animated: true,
    exact: true,
  },
  {
    href: "/dashboard/wallets",
    label: "Wallets",
    description: "Registry and balances",
    icon: Wallet,
    animated: true,
  },
  {
    href: "/dashboard/agents",
    label: "Agents",
    description: "Sessions and scopes",
    icon: Agent,
    animated: true,
  },
  {
    href: "/dashboard/policies",
    label: "Policies",
    description: "On-chain templates",
    icon: ScrollText,
    animated: false,
  },
  {
    href: "/dashboard/conduit",
    label: "Conduit",
    description: "Agent gateway and approvals",
    icon: Shield,
    animated: true,
  },
  {
    href: "/dashboard/activity",
    label: "Activity",
    description: "Events and approvals",
    icon: Activity,
    animated: true,
  },
];

const utilityNav: NavItem[] = [
  {
    href: "/dashboard/settings",
    label: "Settings",
    description: "Runtime defaults",
    icon: Settings,
    animated: true,
  },
  {
    href: DEFAULT_DOCS_URL,
    label: "Documentation",
    description: "Program and SDK references",
    icon: Documentations,
    animated: true,
    external: true,
  },
];

const sidebarTransition = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.7,
} as const;

const SIDEBAR_WIDTH = {
  collapsed: 88,
  expanded: 288,
} as const;

const SHELL_OFFSET = {
  collapsed: 100,
  expanded: 304,
} as const;

const SIDEBAR_ICON_STROKE_WIDTH = 2.25;

const pageMeta = [
  {
    href: "/dashboard",
    exact: true,
    title: "Overview",
    description: "Agent custody and control-plane status",
  },
  {
    href: "/dashboard/wallets",
    title: "Wallets",
    description: "Registered agent wallets and live balance reads",
  },
  {
    href: "/dashboard/agents",
    title: "Agents",
    description: "Conduit sessions, scopes, and approvals",
  },
  {
    href: "/dashboard/policies",
    title: "Policies",
    description: "On-chain policy templates and treasury applies",
  },
  {
    href: "/dashboard/conduit",
    title: "Conduit",
    description: "Agent gateway, authorization, and runtime access",
  },
  {
    href: "/dashboard/activity",
    title: "Activity",
    description: "Control-plane events and settlement trail",
  },
  {
    href: "/dashboard/settings",
    title: "Settings",
    description: "Runtime, RPC, and program configuration",
  },
];

function usePersistedSidebarState() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("aura:dashboard-sidebar");
    if (stored === "collapsed") {
      setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "aura:dashboard-sidebar",
      collapsed ? "collapsed" : "expanded",
    );
  }, [collapsed]);

  return [collapsed, setCollapsed] as const;
}

function useLogoSrc() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return !mounted || resolvedTheme === "dark"
    ? "/dark-logo-wordmark.svg"
    : "/light-logo-wordmark.svg";
}

function SidebarNavItem({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const Icon = item.icon;
  const active =
    item.exact || item.href === "/"
      ? pathname === item.href
      : !item.external && pathname.startsWith(item.href);
  const iconClassName = cn(
    "size-4 shrink-0 transition-colors",
    active
      ? "text-(--text-main)"
      : "text-(--text-muted) group-hover:text-(--text-main)",
  );
  const icon = item.animated ? (
    (() => {
      const AnimatedIcon = Icon as ComponentType<AnimatedSidebarIconProps>;
      return (
        <AnimatedIcon
          animateOnHover={!reduceMotion}
          className={iconClassName}
          size={16}
          strokeWidth={SIDEBAR_ICON_STROKE_WIDTH}
          aria-hidden={true}
        />
      );
    })()
  ) : (
    <Icon
      className={iconClassName}
      size={16}
      strokeWidth={SIDEBAR_ICON_STROKE_WIDTH}
      aria-hidden={true}
    />
  );

  const content = (
    <>
      {active ? (
        <m.span
          layoutId="dashboard-sidebar-active"
          className="absolute left-1 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary"
          transition={sidebarTransition}
        />
      ) : null}
      {icon}
      <m.span
        aria-hidden={collapsed}
        animate={{
          opacity: collapsed ? 0 : 1,
          transform: collapsed
            ? "translate3d(-4px, 0, 0)"
            : "translate3d(0, 0, 0)",
        }}
        className="pointer-events-none absolute left-10 right-3 min-w-0 truncate whitespace-nowrap text-left"
        initial={false}
        transition={sidebarTransition}
      >
        {item.label}
      </m.span>
      {item.badge && !collapsed ? (
        <span className="ml-auto rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-(--text-muted)">
          {item.badge}
        </span>
      ) : null}
    </>
  );

  const className = cn(
    "group relative flex min-h-10 items-center gap-3 overflow-hidden rounded-md px-3 text-sm transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg)",
    collapsed && "lg:h-10 lg:w-10 lg:flex-none lg:justify-center lg:px-0",
    active
      ? "bg-white/[0.055] text-(--text-main) light:bg-black/[0.055]"
      : "text-(--text-muted) hover:bg-white/[0.04] hover:text-(--text-main) light:hover:bg-black/[0.04]",
  );

  const node = item.external ? (
    <a
      href={item.href}
      target="_blank"
      rel="noreferrer"
      aria-label={collapsed ? item.label : undefined}
      className={className}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
    >
      {content}
    </a>
  ) : (
    <Link
      href={item.href}
      aria-label={collapsed ? item.label : undefined}
      className={className}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
    >
      {content}
    </Link>
  );

  return collapsed ? (
    <Tooltip
      content={item.label}
      position="right"
      className="flex w-full justify-center"
    >
      {node}
    </Tooltip>
  ) : (
    node
  );
}

function SidebarUtilityLink({
  item,
  onNavigate,
  tooltipPosition,
}: {
  item: NavItem;
  onNavigate?: () => void;
  tooltipPosition: "top" | "right";
}) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const Icon = item.icon;
  const active =
    item.exact || item.href === "/"
      ? pathname === item.href
      : !item.external && pathname.startsWith(item.href);
  const className = cn(
    "inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-(--text-muted) transition-colors hover:bg-white/[0.04] hover:text-(--text-main) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg) light:hover:bg-black/[0.04]",
    active && "bg-white/[0.055] text-(--text-main) light:bg-black/[0.055]",
  );
  const iconProps = {
    className: "size-4",
    size: 16,
    strokeWidth: SIDEBAR_ICON_STROKE_WIDTH,
    "aria-hidden": true,
  } satisfies SidebarIconProps;
  const content = item.animated ? (
    (() => {
      const AnimatedIcon = Icon as ComponentType<AnimatedSidebarIconProps>;
      return <AnimatedIcon animateOnHover={!reduceMotion} {...iconProps} />;
    })()
  ) : (
    <Icon {...iconProps} />
  );
  const node = item.external ? (
    <a
      href={item.href}
      target="_blank"
      rel="noreferrer"
      aria-label={item.label}
      className={className}
      onClick={onNavigate}
    >
      {content}
    </a>
  ) : (
    <Link
      href={item.href}
      aria-label={item.label}
      className={className}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
    >
      {content}
    </Link>
  );

  return (
    <Tooltip content={item.label} position={tooltipPosition}>
      {node}
    </Tooltip>
  );
}

function SidebarUtilityBar({
  collapsed,
  onToggleCollapse,
  onNavigate,
  mobile,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
  mobile: boolean;
}) {
  const vertical = collapsed && !mobile;
  const tooltipPosition = vertical ? "right" : "top";

  return (
    <div
      className={cn(
        "mt-auto flex pt-4",
        vertical ? "flex-col items-center gap-1" : "items-center gap-1",
      )}
    >
      <nav
        className={cn("flex gap-1", vertical && "flex-col")}
        aria-label="Dashboard utility navigation"
      >
        {utilityNav.map((item) => (
          <SidebarUtilityLink
            key={item.href}
            item={item}
            onNavigate={onNavigate}
            tooltipPosition={tooltipPosition}
          />
        ))}
      </nav>

      <div
        className={cn(
          "flex gap-1",
          vertical ? "flex-col" : "ml-auto items-center",
        )}
      >
        <Tooltip content="Toggle theme" position={tooltipPosition}>
          <ThemeToggle className="h-10! w-10! min-w-10! rounded-md! border-0! bg-transparent! px-0! py-0! text-(--text-muted) hover:bg-white/[0.04]! hover:text-(--text-main) light:hover:bg-black/[0.04]!" />
        </Tooltip>

        {!mobile ? (
          <Tooltip
            content={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            position={tooltipPosition}
          >
            <button
              type="button"
              onClick={onToggleCollapse}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-(--text-muted) transition-colors hover:bg-white/[0.04] hover:text-(--text-main) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg) light:hover:bg-black/[0.04]"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" aria-hidden />
              ) : (
                <PanelLeftClose className="size-4" aria-hidden />
              )}
            </button>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}

function SidebarContent({
  collapsed,
  setCollapsed,
  onNavigate,
  mobile = false,
}: {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const logoSrc = useLogoSrc();

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[14px] border border-[rgba(255,255,255,0.12)] bg-[rgba(28,28,32,0.82)] shadow-[0_8px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-[16px] light:border-[rgba(0,0,0,0.1)] light:bg-[rgba(255,255,255,0.72)] light:shadow-[0_8px_40px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]">
      <div
        className={cn(
          "flex min-h-16 items-center px-4",
          collapsed && !mobile && "lg:justify-center lg:px-2",
        )}
      >
        <Link
          href="/"
          className={cn(
            "flex min-h-10 min-w-10 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg)",
            collapsed && !mobile ? "justify-center" : "justify-start",
          )}
          onClick={onNavigate}
          title="AURA"
        >
          <m.span
            className="block h-[23px] overflow-hidden"
            animate={{ width: collapsed && !mobile ? 26 : 92 }}
            transition={sidebarTransition}
          >
            <Image
              src={logoSrc}
              alt="AURA"
              width={92}
              height={23}
              className="h-[23px] w-[92px] max-w-none"
              suppressHydrationWarning
            />
          </m.span>
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
        <nav className="space-y-1" aria-label="Dashboard primary navigation">
          {primaryNav.map((item) => (
            <SidebarNavItem
              key={item.href}
              item={item}
              collapsed={collapsed && !mobile}
              onNavigate={onNavigate}
            />
          ))}
        </nav>

        <SidebarUtilityBar
          collapsed={collapsed && !mobile}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          onNavigate={onNavigate}
          mobile={mobile}
        />
      </div>
    </div>
  );
}

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = usePersistedSidebarState();
  const [mobileOpen, setMobileOpen] = useState(false);
  const shellOffset = collapsed
    ? SHELL_OFFSET.collapsed
    : SHELL_OFFSET.expanded;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  const currentPage = useMemo(
    () =>
      pageMeta.find((page) =>
        page.exact ? pathname === page.href : pathname.startsWith(page.href),
      ) ?? pageMeta[0],
    [pathname],
  );

  return (
    <div className="min-h-screen bg-(--bg) text-(--text-main)">
      <m.aside
        animate={{
          width: collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded,
        }}
        initial={false}
        transition={sidebarTransition}
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden p-3 lg:flex",
          collapsed ? "w-[88px]" : "w-[288px]",
        )}
      >
        <SidebarContent collapsed={collapsed} setCollapsed={setCollapsed} />
      </m.aside>

      <AnimatePresence>
        {mobileOpen ? (
          <m.div
            className="fixed inset-0 z-[120] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-black/60"
              onClick={() => setMobileOpen(false)}
            />
            <m.aside
              className="relative flex h-full w-[min(320px,calc(100vw-32px))] flex-col p-3"
              initial={{ x: -28, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -28, opacity: 0 }}
              transition={sidebarTransition}
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-6 top-6 z-10 flex min-h-10 min-w-10 items-center justify-center rounded-md border border-border bg-(--card-bg) text-(--text-muted) hover:bg-(--hover-bg) hover:text-(--text-main) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg)"
                aria-label="Close navigation"
              >
                <X className="size-4" aria-hidden />
              </button>
              <SidebarContent
                collapsed={false}
                setCollapsed={setCollapsed}
                mobile={true}
                onNavigate={() => setMobileOpen(false)}
              />
            </m.aside>
          </m.div>
        ) : null}
      </AnimatePresence>

      <m.div
        animate={
          {
            "--dashboard-shell-offset": `${shellOffset}px`,
          } as Record<string, string>
        }
        className="min-h-screen lg:pl-[var(--dashboard-shell-offset)]"
        initial={false}
        style={
          {
            "--dashboard-shell-offset": `${shellOffset}px`,
          } as CSSProperties
        }
        transition={sidebarTransition}
      >
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="flex min-h-10 min-w-10 items-center justify-center rounded-md border border-border text-(--text-muted) transition-colors hover:bg-(--hover-bg) hover:text-(--text-main) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg) lg:hidden"
                aria-label="Open navigation"
                aria-expanded={mobileOpen}
              >
                <Menu className="size-4" aria-hidden />
              </button>

              <div className="min-w-0">
                <p className="truncate font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                  {currentPage.title}
                </p>
                <p className="mt-1 hidden truncate text-sm text-(--text-muted) sm:block">
                  {currentPage.description}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge tone="success" className="hidden sm:inline-flex">
                Devnet
              </StatusBadge>
              <AuthButton />
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </m.div>
    </div>
  );
}
