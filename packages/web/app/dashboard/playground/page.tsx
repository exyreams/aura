"use client";

import {
  AURA_FEATURE_DOMAINS,
  type AuraFeatureMaturity,
} from "@aura-protocol/sdk-ts";
import { m } from "motion/react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/global/Alert";
import { Badge, type BadgeVariant } from "@/components/global/Badge";
import Sheet from "@/components/global/Sheet";
import { Skeleton } from "@/components/global/Skeleton";
import { Tooltip } from "@/components/global/Tooltip";
import {
  Activity,
  Checkcircle,
  FileText,
  Lock,
  RefreshCw,
  Settings,
  Shield,
  ShieldCheck,
  Users,
  Vault,
  Wallet,
  Zap,
} from "@/components/icons";
import {
  InstructionBuilder,
  InstructionBuilderSkeleton,
} from "@/components/playground/InstructionBuilder";
import {
  type InstructionCatalogResponse,
  useInstructionCatalog,
} from "@/lib/hooks";
import { cn, formatNumber } from "@/lib/utils";

const maturityLabels: Record<AuraFeatureMaturity, string> = {
  wallet: "Wallet",
  backend: "Backend",
  read_only: "Read-only",
  external_cpi: "Ext. CPI",
};

type DomainId = keyof typeof domainIcons;

const domainIcons = {
  treasury: Vault,
  confidential: Lock,
  execution: Activity,
  governance: ShieldCheck,
  dwallet: Shield,
  policy: Settings,
  budget: Wallet,
  operational: RefreshCw,
  lifecycle: RefreshCw,
  swarm: Users,
  fees: Zap,
  address_lists: FileText,
  batch: Checkcircle,
};

const currentInstructionNames = new Set(
  AURA_FEATURE_DOMAINS.flatMap((domain) =>
    domain.instructions.map((instruction) => instruction.name),
  ),
);
const currentInstructionCount = currentInstructionNames.size;
const currentDomainById = new Map(
  AURA_FEATURE_DOMAINS.map((domain) => [domain.id, domain]),
);
const currentInstructionByName = new Map(
  AURA_FEATURE_DOMAINS.flatMap((domain) =>
    domain.instructions.map((instruction) => [instruction.name, instruction]),
  ),
);

type SelectedInstruction = {
  domain: InstructionCatalogResponse["domains"][number];
  instruction: InstructionCatalogResponse["domains"][number]["instructions"][number];
} | null;

function normalizeCatalog(
  catalog: InstructionCatalogResponse | undefined,
): InstructionCatalogResponse | undefined {
  if (!catalog) return undefined;

  const domains = catalog.domains.flatMap((domain) => {
    const currentDomain = currentDomainById.get(domain.id);
    const instructions = domain.instructions.flatMap((instruction) => {
      if (!currentInstructionNames.has(instruction.name)) return [];
      const current = currentInstructionByName.get(instruction.name);
      return [
        current
          ? {
              ...instruction,
              label: current.label,
              description: current.description,
              maturity: current.maturity,
            }
          : instruction,
      ];
    });
    if (instructions.length === 0) return [];
    return [
      {
        ...domain,
        label: currentDomain?.label ?? domain.label,
        description: currentDomain?.description ?? domain.description,
        instructions,
      },
    ];
  });

  return {
    ...catalog,
    domains,
    totals: {
      domains: domains.length,
      instructions: domains.reduce(
        (total, domain) => total + domain.instructions.length,
        0,
      ),
    },
  };
}

function InstructionCard({
  domain,
  instruction,
  isActive,
  onSelect,
}: {
  domain: InstructionCatalogResponse["domains"][number];
  instruction: InstructionCatalogResponse["domains"][number]["instructions"][number];
  isActive: boolean;
  onSelect: (s: SelectedInstruction) => void;
}) {
  return (
    <Tooltip
      content={
        isActive ? (
          <>
            Close <strong>{instruction.name}</strong> builder
          </>
        ) : (
          <>
            Open <strong>{instruction.name}</strong> in instruction builder
          </>
        )
      }
    >
      <button
        type="button"
        onClick={() => onSelect({ domain, instruction })}
        className={cn(
          "group w-full text-left border rounded p-4 transition-all cursor-pointer",
          isActive
            ? "border-primary ring-1 ring-primary bg-(--accordion-hover)"
            : "border-border hover:border-primary bg-(--accordion-bg) hover:bg-(--accordion-hover)",
        )}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-semibold text-(--text-main) leading-tight">
            {instruction.label}
          </p>
          <Badge
            variant={instruction.maturity as BadgeVariant}
            className="shrink-0 px-2 py-0.5 text-[9px]"
          >
            {maturityLabels[instruction.maturity]}
          </Badge>
        </div>
        <p className="text-xs text-(--text-muted) leading-relaxed mb-2 line-clamp-2">
          {instruction.description}
        </p>
        <code className="inline-block text-[10px] bg-(--hover-bg) border border-border rounded-sm px-1.5 py-0.5 text-(--text-muted)">
          {instruction.name}
        </code>
      </button>
    </Tooltip>
  );
}

function DomainSection({
  domain,
  selectedName,
  onSelect,
}: {
  domain: InstructionCatalogResponse["domains"][number];
  selectedName: string | null;
  onSelect: (s: SelectedInstruction) => void;
}) {
  const Icon = domainIcons[domain.id as DomainId] ?? FileText;

  return (
    <div>
      {/* Domain header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="size-6 rounded-sm border border-border bg-(--hover-bg) flex items-center justify-center shrink-0">
          <Icon className="size-3.5 text-(--text-muted)" animateOnHover />
        </div>
        <span className="text-sm font-semibold text-(--text-main)">
          {domain.label}
        </span>
        <span className="mono text-[10px] text-(--text-muted)">
          {domain.instructions.length}
        </span>
      </div>

      {/* Instruction cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {domain.instructions.map((instruction) => (
          <InstructionCard
            key={instruction.name}
            domain={domain}
            instruction={instruction}
            isActive={selectedName === instruction.name}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

export default function PlaygroundPage() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [selected, setSelected] = useState<SelectedInstruction>(null);

  const catalogQuery = useInstructionCatalog();
  const rawCatalog = catalogQuery.data;
  const catalog = useMemo(() => normalizeCatalog(rawCatalog), [rawCatalog]);

  const listedInstructionCount = useMemo(
    () =>
      catalog
        ? catalog.domains.reduce((t, d) => t + d.instructions.length, 0)
        : 0,
    [catalog],
  );

  const hasCatalogMismatch =
    catalog !== undefined && listedInstructionCount !== currentInstructionCount;
  const hasStaleBackendCatalog =
    rawCatalog !== undefined &&
    rawCatalog.totals.instructions !== listedInstructionCount;

  const filterChips = useMemo(() => {
    const all = { id: "all", label: "All", count: listedInstructionCount };
    if (!catalog) return [all];
    return [
      all,
      ...catalog.domains.map((d) => ({
        id: d.id,
        label: d.label,
        count: d.instructions.length,
      })),
    ];
  }, [catalog, listedInstructionCount]);

  const visibleDomains = useMemo(() => {
    if (!catalog) return [];
    if (activeFilter === "all") return catalog.domains;
    return catalog.domains.filter((d) => d.id === activeFilter);
  }, [catalog, activeFilter]);

  const handleSelect = (s: SelectedInstruction) => {
    if (s && selected?.instruction.name === s.instruction.name) {
      setSelected(null);
    } else {
      setSelected(s);
    }
  };

  return (
    <div className="relative max-w-[1600px] mx-auto">
      {/* Dev tool notice */}
      <Alert
        variant="info"
        message="Playground is a developer tool for testing program instructions directly. Live state feedback, simulation mode, and transaction history are coming soon."
        className="mb-8"
      />

      {/* Header */}
      <header className="mb-8 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
            Playground
          </span>
          <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight text-(--text-main) mb-2">
            Instruction Playground
          </h1>
          <p className="text-(--text-muted) font-light max-w-2xl text-sm">
            Browse and test every program instruction. Sourced live from the
            TypeScript SDK and backend catalog.
          </p>
        </div>

        {catalog ? (
          <div className="flex items-center gap-5 shrink-0 pb-1">
            <div className="text-right">
              <p className="mono text-[10px] uppercase tracking-widest text-(--text-muted) mb-0.5">
                Domains
              </p>
              <p className="text-2xl font-bold text-(--text-main)">
                {formatNumber(catalog.totals.domains)}
              </p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-right">
              <p className="mono text-[10px] uppercase tracking-widest text-(--text-muted) mb-0.5">
                Instructions
              </p>
              <p className="text-2xl font-bold text-(--text-main)">
                {formatNumber(listedInstructionCount)}
              </p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-right">
              <p className="mono text-[10px] uppercase tracking-widest text-(--text-muted) mb-0.5">
                Sync
              </p>
              <div className="flex items-center justify-end gap-1.5">
                <Checkcircle className="size-4 text-success" animateOnHover />
                <span className="font-mono text-sm text-(--text-main)">
                  {listedInstructionCount}/{currentInstructionCount}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-5 shrink-0">
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-10 w-16" />
          </div>
        )}
      </header>

      {/* Alerts */}
      {catalogQuery.isError && (
        <Alert
          variant="warning"
          message="Backend instruction catalog is unavailable. Instruction builders cannot refresh until the backend is reachable."
          className="mb-6"
        />
      )}
      {hasCatalogMismatch && (
        <Alert
          variant="warning"
          message={`Instruction catalog mismatch: ${listedInstructionCount} listed, ${currentInstructionCount} expected from the current SDK surface.`}
          className="mb-6"
        />
      )}
      {hasStaleBackendCatalog && !hasCatalogMismatch && (
        <Alert
          variant="warning"
          message="Backend returned stale instruction metadata. Showing the current SDK control surface."
          className="mb-6"
        />
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-8">
        {catalog ? (
          filterChips.map((chip) => {
            const active = activeFilter === chip.id;
            return (
              <m.button
                key={chip.id}
                type="button"
                onClick={() => setActiveFilter(chip.id)}
                className={cn(
                  "relative inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 font-mono text-[11px] transition-colors z-10 cursor-pointer",
                  active
                    ? "border-(--success-border) text-(--success-text)"
                    : "bg-(--card-bg) border-border text-(--text-muted) hover:text-(--text-main)",
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                {active && (
                  <m.div
                    layoutId="chip-bg"
                    className="absolute inset-0 rounded-sm bg-(--success-bg) -z-10"
                    transition={{
                      type: "spring",
                      stiffness: 350,
                      damping: 28,
                      mass: 0.8,
                    }}
                  />
                )}
                {chip.label}
                <span
                  className={cn(
                    "text-[10px] tabular-nums",
                    active ? "opacity-70" : "text-(--text-muted)",
                  )}
                >
                  {chip.count}
                </span>
              </m.button>
            );
          })
        ) : (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
              <Skeleton key={i} className="h-8 w-24 rounded-sm" />
            ))}
          </div>
        )}
      </div>

      {/* Domain sections */}
      {catalog ? (
        <div className="space-y-10">
          {visibleDomains.map((domain) => (
            <DomainSection
              key={domain.id}
              domain={domain}
              selectedName={selected?.instruction.name ?? null}
              onSelect={handleSelect}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-10">
          {Array.from({ length: 3 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                  <Skeleton key={j} className="h-20" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Instruction builder sheet */}
      <Sheet
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        defaultWidth={620}
        minWidth={480}
        maxWidth={900}
        resizable
      >
        {selected?.instruction.schema ? (
          catalogQuery.isLoading ? (
            <InstructionBuilderSkeleton />
          ) : (
            <InstructionBuilder
              key={selected.instruction.name}
              found={selected}
              schema={selected.instruction.schema}
            />
          )
        ) : null}
      </Sheet>
    </div>
  );
}
