"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  StatusPill,
  Surface,
} from "@/components/app/ui";
import { useOwnedTreasuries } from "@/lib/hooks";
import { formatCurrency, shortenAddress } from "@/lib/utils";

export default function TreasuriesPage() {
  const { publicKey } = useWallet();
  const query = useOwnedTreasuries();
  const treasuries = query.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Treasuries"
        title="My Treasuries"
        copy="This directory is loaded from on-chain treasury accounts owned by the connected wallet."
        action={
          <Link className="button-primary" href="/app/treasuries/new">
            Create Treasury
          </Link>
        }
      />

      <Surface
        title="Treasury Directory"
        copy="Select a treasury to open the full operational detail page."
      >
        {!publicKey ? (
          <EmptyState
            title="Wallet not connected"
            copy="Connect a wallet to query owned treasury accounts."
          />
        ) : treasuries.length === 0 ? (
          <EmptyState
            title="No treasuries found"
            copy="This wallet does not currently own any AURA treasuries."
          />
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Agent ID</th>
                  <th>PDA</th>
                  <th>Status</th>
                  <th>Daily Limit</th>
                  <th>Total Tx</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {treasuries.map((treasury) => (
                  <tr key={treasury.publicKey.toBase58()}>
                    <td>
                      <Link
                        href={`/app/treasuries/${treasury.publicKey.toBase58()}`}
                        className="font-medium text-white"
                      >
                        {treasury.account.agentId}
                      </Link>
                    </td>
                    <td className="mono">
                      {shortenAddress(treasury.publicKey.toBase58(), 5, 5)}
                    </td>
                    <td>
                      <StatusPill
                        status={
                          treasury.account.executionPaused ? "Paused" : "Active"
                        }
                      />
                    </td>
                    <td>
                      {formatCurrency(
                        Number(
                          treasury.account.policyConfig.dailyLimitUsd.toString(),
                        ),
                      )}
                    </td>
                    <td>{treasury.account.totalTransactions.toString()}</td>
                    <td>
                      {new Date(
                        Number(treasury.account.createdAt.toString()) * 1000,
                      ).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}
