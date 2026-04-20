import { Box, Text, useApp, useInput, render } from "ink";
import React, { useEffect, useState } from "react";
import { PublicKey, type PublicKey as PublicKeyType } from "@solana/web3.js";

import type { CliContext } from "./context.js";
import { formatTimestamp } from "./format.js";
import { createTable } from "./output.js";
import {
  getMessageApprovalState,
  parseCiphertextVerified,
  parseDecryptionReady,
} from "./protocol.js";
import type { TreasuryAccountRecord } from "./sdk.js";
import { renderTreasurySections } from "./treasury-view.js";

interface DashboardSnapshot {
  treasury: PublicKey;
  account: TreasuryAccountRecord;
  livePanel?: string;
  refreshedAt: Date;
}

async function buildLivePanel(
  ctx: CliContext,
  account: TreasuryAccountRecord,
): Promise<string | undefined> {
  const pending = account.pending;
  if (!pending) {
    return undefined;
  }

  const table = createTable(["Live", "Value"]);

  if (pending.policyOutputCiphertextAccount) {
    const info = await ctx.connection.getAccountInfo(
      new PublicKey(pending.policyOutputCiphertextAccount),
      "confirmed",
    );
    table.push(["Policy output verified", parseCiphertextVerified(info) ? "Yes" : "No"]);
  }

  if (pending.decryptionRequest?.requestAccount) {
    const info = await ctx.connection.getAccountInfo(
      new PublicKey(pending.decryptionRequest.requestAccount),
      "confirmed",
    );
    table.push(["Decryption ready", parseDecryptionReady(info) ? "Yes" : "No"]);
  }

  if (pending.signatureRequest?.messageApprovalAccount) {
    const state = await getMessageApprovalState(
      ctx.connection,
      new PublicKey(pending.signatureRequest.messageApprovalAccount),
    );
    table.push(["Message approval", state]);
  }

  return table.length > 0 ? table.toString() : undefined;
}

async function readSnapshot(
  ctx: CliContext,
  treasury: PublicKeyType,
): Promise<DashboardSnapshot> {
  const account = await ctx.client.getTreasuryAccount(treasury);
  return {
    treasury,
    account,
    livePanel: await buildLivePanel(ctx, account),
    refreshedAt: new Date(),
  };
}

function Section(props: { title: string; body: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
      <Text color="cyanBright">{props.title}</Text>
      <Text>{props.body}</Text>
    </Box>
  );
}

function DashboardApp(props: {
  ctx: CliContext;
  treasury: PublicKey;
  intervalMs: number;
}) {
  const { exit } = useApp();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: NodeJS.Timeout | undefined;

    const refresh = async () => {
      try {
        const next = await readSnapshot(props.ctx, props.treasury);
        if (!active) {
          return;
        }
        setSnapshot(next);
        setError(null);
      } catch (nextError) {
        if (!active) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    };

    void refresh();
    timer = setInterval(() => {
      void refresh();
    }, props.intervalMs);

    return () => {
      active = false;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [props.ctx, props.intervalMs, props.treasury, refreshCount]);

  useInput((input, key) => {
    if (input === "q" || key.escape || (key.ctrl && input === "c")) {
      exit();
      return;
    }
    if (input === "r") {
      setRefreshCount((value) => value + 1);
    }
  });

  if (!snapshot) {
    return (
      <Box flexDirection="column">
        <Text color="cyanBright">AURA Dashboard</Text>
        <Text>{error ? `Loading failed: ${error}` : "Loading treasury state..."}</Text>
      </Box>
    );
  }

  const sections = renderTreasurySections(snapshot.treasury, snapshot.account);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="column">
        <Text color="cyanBright">AURA Dashboard</Text>
        <Text>
          {snapshot.account.agentId} | {snapshot.treasury.toBase58()} | refreshed{" "}
          {formatTimestamp(Math.floor(snapshot.refreshedAt.getTime() / 1000))}
        </Text>
        <Text color="gray">Press r to refresh, q or Esc to quit.</Text>
      </Box>

      {error ? (
        <Box marginBottom={1}>
          <Text color="red">Last refresh failed: {error}</Text>
        </Box>
      ) : null}

      <Section title="Overview" body={sections.overview} />
      <Section title="Policy" body={sections.policy} />
      {sections.confidential ? <Section title="Confidential" body={sections.confidential} /> : null}
      {sections.pending ? <Section title="Pending" body={sections.pending} /> : null}
      {snapshot.livePanel ? <Section title="Live" body={snapshot.livePanel} /> : null}
      {sections.dwallets ? <Section title="dWallets" body={sections.dwallets} /> : null}
      {sections.governance ? <Section title="Governance" body={sections.governance} /> : null}
    </Box>
  );
}

export async function runDashboard(options: {
  ctx: CliContext;
  treasury: PublicKey;
  intervalMs: number;
}): Promise<void> {
  const app = render(
    <DashboardApp
      ctx={options.ctx}
      treasury={options.treasury}
      intervalMs={options.intervalMs}
    />,
    { exitOnCtrlC: true },
  );
  await app.waitUntilExit();
}
