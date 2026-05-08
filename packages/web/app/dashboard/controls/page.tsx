"use client";

import {
  AURA_FEATURE_DOMAINS,
  type AuraFeatureMaturity,
} from "@aura-protocol/sdk-ts";
import {
  Activity,
  Bot,
  CheckCircle2,
  Code2,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Alert } from "@/components/global/Alert";
import { Button } from "@/components/global/Button";
import { Card } from "@/components/global/Card";
import { Skeleton } from "@/components/global/Skeleton";
import {
  type InstructionCatalogResponse,
  useInstructionCatalog,
} from "@/lib/hooks";
import { cn, formatNumber } from "@/lib/utils";

const maturityLabels: Record<AuraFeatureMaturity, string> = {
  wallet: "Wallet",
  backend: "Backend",
  read_only: "Read-only",
  external_cpi: "External CPI",
};

const maturityStyles: Record<AuraFeatureMaturity, string> = {
  wallet: "border-primary/50 text-(--text-main) bg-(--hover-bg)",
  backend: "border-blue-400/30 text-blue-200 bg-blue-500/10",
  read_only: "border-zinc-400/30 text-zinc-300 bg-zinc-500/10",
  external_cpi: "border-amber-400/30 text-amber-200 bg-amber-500/10",
};

const domainIcons = {
  treasury: WalletCards,
  confidential: LockKeyhole,
  execution: Terminal,
  governance: ShieldCheck,
  dwallet: Bot,
  policy: Code2,
  budget: SlidersHorizontal,
  operational: Activity,
  lifecycle: RefreshCw,
  swarm: Bot,
  fees: WalletCards,
  address_lists: ShieldCheck,
  batch: Code2,
};

const maturityFilters: Array<"all" | AuraFeatureMaturity> = [
  "all",
  "wallet",
  "backend",
  "external_cpi",
  "read_only",
];

const statSkeletonKeys = ["domains", "instructions", "backend", "sdk"];
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

function countByMaturity(catalog: InstructionCatalogResponse) {
  return catalog.domains.reduce(
    (counts, domain) => {
      for (const instruction of domain.instructions) {
        counts[instruction.maturity] += 1;
      }
      return counts;
    },
    {
      wallet: 0,
      backend: 0,
      read_only: 0,
      external_cpi: 0,
    } satisfies Record<AuraFeatureMaturity, number>,
  );
}

function normalizeCatalog(
  catalog: InstructionCatalogResponse | undefined,
): InstructionCatalogResponse | undefined {
  if (!catalog) {
    return undefined;
  }

  const domains = catalog.domains
    .map((domain) => {
      const currentDomain = currentDomainById.get(domain.id);
      const instructions = domain.instructions
        .filter((instruction) => currentInstructionNames.has(instruction.name))
        .map((instruction) => {
          const current = currentInstructionByName.get(instruction.name);
          return current
            ? {
                ...instruction,
                label: current.label,
                description: current.description,
                maturity: current.maturity,
              }
            : instruction;
        });

      return {
        ...domain,
        label: currentDomain?.label ?? domain.label,
        description: currentDomain?.description ?? domain.description,
        instructions,
      };
    })
    .filter((domain) => domain.instructions.length > 0);

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

export default function FeatureSurfacePage() {
  const [maturityFilter, setMaturityFilter] = useState<
    "all" | AuraFeatureMaturity
  >("all");
  const catalogQuery = useInstructionCatalog();
  const rawCatalog = catalogQuery.data;
  const catalog = useMemo(() => normalizeCatalog(rawCatalog), [rawCatalog]);

  const maturityCounts = useMemo(
    () => (catalog ? countByMaturity(catalog) : undefined),
    [catalog],
  );

  const filteredDomains = useMemo(() => {
    if (!catalog) {
      return [];
    }

    return catalog.domains
      .map((domain) => ({
        ...domain,
        instructions:
          maturityFilter === "all"
            ? domain.instructions
            : domain.instructions.filter(
                (instruction) => instruction.maturity === maturityFilter,
              ),
      }))
      .filter((domain) => domain.instructions.length > 0);
  }, [catalog, maturityFilter]);

  const listedInstructionCount = useMemo(
    () =>
      catalog
        ? catalog.domains.reduce(
            (total, domain) => total + domain.instructions.length,
            0,
          )
        : 0,
    [catalog],
  );

  const expectedInstructionCount = currentInstructionCount;
  const hasCatalogMismatch =
    catalog !== undefined &&
    listedInstructionCount !== expectedInstructionCount;
  const hasStaleBackendCatalog =
    rawCatalog !== undefined &&
    rawCatalog.totals.instructions !== listedInstructionCount;

  return (
    <div className="relative max-w-[1600px] mx-auto">
      <header className="mb-10 flex flex-col xl:flex-row xl:items-end justify-between gap-6">
        <div>
          <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
            Control Surface
          </span>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-(--text-main) mb-2">
            Policy, execution, and treasury controls.
          </h1>
          <p className="text-(--text-muted) font-light max-w-2xl">
            A live capability map sourced from the latest TypeScript SDK and the
            backend instruction catalog endpoint.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/treasuries">
            <Button variant="secondary" size="small">
              Treasuries
            </Button>
          </Link>
          <Link href="/dashboard/agent">
            <Button variant="secondary" size="small">
              Agents
            </Button>
          </Link>
          <Link href="/dashboard/settings">
            <Button variant="primary" size="small">
              Settings
            </Button>
          </Link>
        </div>
      </header>

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
          message={`Instruction catalog mismatch: ${listedInstructionCount} listed, ${expectedInstructionCount} expected from the current SDK surface.`}
          className="mb-6"
        />
      )}
      {hasStaleBackendCatalog && !hasCatalogMismatch && (
        <Alert
          variant="warning"
          message="Backend returned stale instruction metadata. Showing the current scalar-only SDK control surface."
          className="mb-6"
        />
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {catalog ? (
          <>
            <Card className="p-5" hover={false}>
              <p className="mono text-[10px] uppercase tracking-widest text-(--text-muted) mb-2">
                Domains
              </p>
              <p className="text-3xl font-bold text-(--text-main)">
                {formatNumber(catalog.totals.domains)}
              </p>
            </Card>
            <Card className="p-5" hover={false}>
              <p className="mono text-[10px] uppercase tracking-widest text-(--text-muted) mb-2">
                Buildable instructions
              </p>
              <p className="text-3xl font-bold text-(--text-main)">
                {formatNumber(listedInstructionCount)}
              </p>
            </Card>
            <Card className="p-5" hover={false}>
              <p className="mono text-[10px] uppercase tracking-widest text-(--text-muted) mb-2">
                Backend-driven
              </p>
              <p className="text-3xl font-bold text-(--text-main)">
                {formatNumber(maturityCounts?.backend ?? 0)}
              </p>
            </Card>
            <Card className="p-5" hover={false}>
              <p className="mono text-[10px] uppercase tracking-widest text-(--text-muted) mb-2">
                Builder Sync
              </p>
              <div className="flex items-center gap-2 text-(--text-main)">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <span className="font-mono text-sm">
                  {expectedInstructionCount > 0
                    ? `${listedInstructionCount}/${expectedInstructionCount} listed`
                    : "awaiting catalog"}
                </span>
              </div>
            </Card>
          </>
        ) : (
          statSkeletonKeys.map((key) => <Skeleton key={key} className="h-28" />)
        )}
      </section>

      <section className="mb-8 flex flex-wrap items-center gap-2">
        {maturityFilters.map((filter) => {
          const active = maturityFilter === filter;
          const label =
            filter === "all" ? "All" : (maturityLabels[filter] ?? filter);

          return (
            <button
              key={filter}
              type="button"
              onClick={() => setMaturityFilter(filter)}
              className={cn(
                "rounded-sm border px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors",
                active
                  ? "border-primary bg-(--hover-bg) text-(--text-main)"
                  : "border-border text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg)",
              )}
            >
              {label}
            </button>
          );
        })}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {filteredDomains.map((domain) => {
          const Icon = domainIcons[domain.id] ?? Code2;

          return (
            <Card key={domain.id} className="p-0 overflow-hidden" hover={false}>
              <div className="p-6 border-b border-border flex gap-4">
                <div className="h-10 w-10 rounded-sm border border-border bg-(--hover-bg) flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-(--text-main)" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h2 className="text-lg font-bold text-(--text-main)">
                      {domain.label}
                    </h2>
                    <span className="mono text-[10px] text-(--text-muted)">
                      {domain.instructions.length} controls
                    </span>
                  </div>
                  <p className="text-sm text-(--text-muted) leading-relaxed">
                    {domain.description}
                  </p>
                </div>
              </div>

              <div className="divide-y divide-border">
                {domain.instructions.map((instruction) => (
                  <Link
                    key={instruction.name}
                    href={`/dashboard/controls/${instruction.name}`}
                    className="grid gap-3 px-6 py-4 transition-colors hover:bg-(--hover-bg) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                  >
                    <div>
                      <p className="font-medium text-(--text-main)">
                        {instruction.label}
                      </p>
                      <p className="mt-1 text-xs text-(--text-muted) leading-relaxed">
                        {instruction.description}
                      </p>
                      <code className="mt-2 inline-block text-[11px] text-(--text-muted)">
                        {instruction.name}
                      </code>
                    </div>
                    <div className="flex w-fit items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex rounded-sm border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest",
                          maturityStyles[instruction.maturity],
                        )}
                      >
                        {maturityLabels[instruction.maturity]}
                      </span>
                      <span
                        aria-hidden="true"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border text-(--text-muted)"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
