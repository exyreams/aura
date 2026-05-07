import { relations } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  wallet: text("wallet").notNull().unique(),
  createdAt: integer("created_at").notNull(),
});

export const agentKeypairs = sqliteTable(
  "agent_keypairs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(),
    label: text("label").notNull(),
    publicKey: text("public_key").notNull(),
    encryptedSecretKey: text("encrypted_secret_key").notNull(),
    encryptionIv: text("encryption_iv").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("agent_keypairs_user_agent_id_idx").on(table.userId, table.agentId),
    uniqueIndex("agent_keypairs_public_key_idx").on(table.publicKey),
  ],
);

export const treasuries = sqliteTable(
  "treasuries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agentKeypairId: integer("agent_keypair_id")
      .notNull()
      .references(() => agentKeypairs.id, { onDelete: "cascade" }),
    treasuryAddress: text("treasury_address").notNull().unique(),
    agentId: text("agent_id").notNull(),
    pendingVectorPolicyCiphertext: text("pending_vector_policy_ciphertext"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("treasuries_agent_keypair_agent_id_idx").on(
      table.agentKeypairId,
      table.agentId,
    ),
  ],
);

export const dkgSessions = sqliteTable("dkg_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentKeypairId: integer("agent_keypair_id")
    .notNull()
    .references(() => agentKeypairs.id, { onDelete: "cascade" }),
  dwalletAddress: text("dwallet_address").notNull().unique(),
  sessionIdentifier: text("session_identifier").notNull(),
  attestationData: text("attestation_data").notNull(),
  networkSignature: text("network_signature").notNull(),
  networkPubkey: text("network_pubkey").notNull(),
  epoch: text("epoch").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const agentJobs = sqliteTable("agent_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  treasuryId: integer("treasury_id")
    .notNull()
    .references(() => treasuries.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["running", "stopped"] }).notNull().default("stopped"),
  configJson: text("config_json").notNull(),
  lastRunAt: integer("last_run_at"),
  lastError: text("last_error"),
  lastResultJson: text("last_result_json"),
  historyJson: text("history_json").notNull().default("[]"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const authNonces = sqliteTable("auth_nonces", {
  nonce: text("nonce").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
});

export const usersRelations = relations(users, ({ many }) => ({
  agentKeypairs: many(agentKeypairs),
}));

export const agentKeypairsRelations = relations(agentKeypairs, ({ one, many }) => ({
  user: one(users, {
    fields: [agentKeypairs.userId],
    references: [users.id],
  }),
  treasuries: many(treasuries),
  dkgSessions: many(dkgSessions),
}));

export const treasuriesRelations = relations(treasuries, ({ one, many }) => ({
  agentKeypair: one(agentKeypairs, {
    fields: [treasuries.agentKeypairId],
    references: [agentKeypairs.id],
  }),
  jobs: many(agentJobs),
}));

export type UserRecord = typeof users.$inferSelect;
export type AgentKeypairRecord = typeof agentKeypairs.$inferSelect;
export type TreasuryRecord = typeof treasuries.$inferSelect;
export type DkgSessionRecord = typeof dkgSessions.$inferSelect;
export type AgentJobRecord = typeof agentJobs.$inferSelect;
