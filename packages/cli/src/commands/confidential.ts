import { PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import { type Command } from "commander";

import { buildCliContext } from "../context.js";
import { printBanner, printSuccess, emitJson, serializeInstruction, startSpinner } from "../output.js";
import {
  buildDryRunKeypair,
  deriveEncryptAccounts,
  ensureEncryptDeposit,
  markInstructionSigner,
  resolvePendingPolicyOutput,
  resolvePendingRequestAccount,
  resolveScalarGuardrails,
  resolveVectorGuardrail,
  sendInstructionsWithBudget,
  waitForCiphertextVerified,
  waitForDecryptionReady,
} from "../protocol.js";
import {
  encryptU64,
  encryptU64Batch,
  readU64Ciphertext,
} from "../ika.js";
import { renderTreasurySections } from "../treasury-view.js";
import { loadKeypair } from "../wallet.js";
import {
  buildProposeConfidentialArgs,
  promptChain,
  promptNumber,
  promptString,
  promptTransactionType,
  resolveTreasuryAccount,
} from "./helpers.js";

function parsePublicKey(value: string, label: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} must be a valid base58 pubkey`);
  }
}

function normalizeDigestHex(value: string | undefined, label: string): string | null {
  if (!value) {
    return null;
  }
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} must be a 32-byte hex digest`);
  }
  return value.toLowerCase();
}

function normalizePublicKeyHex(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) {
    throw new Error("publicKeyHex must contain valid hex bytes");
  }
  return value.toLowerCase();
}

async function sendPreparedInstruction(options: {
  ctx: ReturnType<typeof buildCliContext>;
  instruction: TransactionInstruction;
  extraSigners?: ReturnType<typeof loadKeypair>[];
}): Promise<string> {
  const { ctx, instruction, extraSigners = [] } = options;
  if (!ctx.wallet) {
    throw new Error("A wallet is required for this command.");
  }
  return await sendInstructionsWithBudget({
    connection: ctx.connection,
    payer: ctx.wallet,
    instructions: [instruction],
    extraSigners,
  });
}

export function registerConfidentialCommands(program: Command): void {
  const confidential = program
    .command("confidential")
    .description("Manage confidential guardrails and policy decryption");

  const deposit = confidential.command("deposit").description("Manage Encrypt deposit accounts");

  deposit
    .command("ensure")
    .description("Ensure the configured wallet has an Encrypt deposit account")
    .action(async function confidentialDepositEnsure() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to manage Encrypt deposit accounts.");
      }

      const dryRunAccounts = deriveEncryptAccounts(ctx.wallet.publicKey, {
        auraProgramId: ctx.programId,
      });
      if (ctx.dryRun) {
        emitJson(ctx.output, {
          action: "confidential.deposit.ensure",
          accounts: dryRunAccounts,
        });
        return;
      }

      const spinner = startSpinner(ctx.output, "Ensuring Encrypt deposit account...");
      const result = await ensureEncryptDeposit({
        connection: ctx.connection,
        payer: ctx.wallet,
        auraProgramId: ctx.programId,
      });
      spinner.succeed(result.created ? "Encrypt deposit created" : "Encrypt deposit ready");

      if (ctx.output.json) {
        emitJson(ctx.output, result);
        return;
      }

      printSuccess(
        ctx.output,
        result.created
          ? `Encrypt deposit created: ${result.accounts.deposit.toBase58()}`
          : `Encrypt deposit ready: ${result.accounts.deposit.toBase58()}`,
      );
    });

  const guardrails = confidential
    .command("guardrails")
    .description("Configure confidential guardrail ciphertexts");

  guardrails
    .command("scalar")
    .description("Attach scalar guardrail ciphertext accounts")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--daily-limit <usd>", "daily limit in USD — auto-encrypted via Ika Encrypt", Number)
    .option("--per-tx-limit <usd>", "per-transaction limit in USD — auto-encrypted via Ika Encrypt", Number)
    .option("--spent-today <usd>", "current spent-today counter in USD (default: 0) — auto-encrypted", Number)
    .option("--daily-limit-ciphertext <pubkey>", "use a pre-created daily limit ciphertext account instead")
    .option("--per-tx-ciphertext <pubkey>", "use a pre-created per-tx limit ciphertext account instead")
    .option("--spent-today-ciphertext <pubkey>", "use a pre-created spent-today ciphertext account instead")
    .action(async function confidentialGuardrailsScalar() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to configure guardrails.");
      }

      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });
      const existing = treasuryState.account.confidentialGuardrails;

      let dailyLimitCiphertext: PublicKey;
      let perTxLimitCiphertext: PublicKey;
      let spentTodayCiphertext: PublicKey;

      // If pre-created ciphertext pubkeys are provided, use them directly.
      // Otherwise encrypt the plaintext values via the Ika Encrypt gRPC.
      if (
        typeof options["dailyLimitCiphertext"] === "string" &&
        typeof options["perTxCiphertext"] === "string" &&
        typeof options["spentTodayCiphertext"] === "string"
      ) {
        dailyLimitCiphertext = parsePublicKey(options["dailyLimitCiphertext"], "Daily limit ciphertext");
        perTxLimitCiphertext = parsePublicKey(options["perTxCiphertext"], "Per-tx limit ciphertext");
        spentTodayCiphertext = parsePublicKey(options["spentTodayCiphertext"], "Spent-today ciphertext");
      } else {
        // Prompt for plaintext values and auto-encrypt
        const dailyLimit = await promptNumber(
          typeof options["dailyLimit"] === "number" ? options["dailyLimit"] : undefined,
          "Daily limit (USD)",
          { validate: (v) => { if (v <= 0) throw new Error("Must be > 0"); } },
        );
        const perTxLimit = await promptNumber(
          typeof options["perTxLimit"] === "number" ? options["perTxLimit"] : undefined,
          "Per-transaction limit (USD)",
          { validate: (v) => { if (v <= 0) throw new Error("Must be > 0"); } },
        );
        const spentToday = typeof options["spentToday"] === "number" ? options["spentToday"] : 0;

        if (ctx.dryRun) {
          emitJson(ctx.output, {
            action: "confidential.guardrails.scalar",
            treasury: treasuryState.treasury,
            note: "dry-run: would encrypt dailyLimit, perTxLimit, spentToday via Ika Encrypt gRPC",
            values: { dailyLimit, perTxLimit, spentToday },
          });
          return;
        }

        const spinner = startSpinner(ctx.output, "Encrypting guardrail values via Ika Encrypt...");
        const [daily, perTx, spent] = await encryptU64Batch(
          [dailyLimit, perTxLimit, spentToday],
          ctx.programId,
        );
        spinner.setText("Waiting for ciphertexts to be verified on-chain...");
        await Promise.all([
          waitForCiphertextVerified(ctx.connection, daily),
          waitForCiphertextVerified(ctx.connection, perTx),
          waitForCiphertextVerified(ctx.connection, spent),
        ]);
        dailyLimitCiphertext = daily;
        perTxLimitCiphertext = perTx;
        spentTodayCiphertext = spent;
        spinner.setText("Configuring scalar guardrails...");

        const now = Math.floor(Date.now() / 1000);
        const signature = await ctx.client.configureConfidentialGuardrails(
          ctx.wallet,
          {
            owner: ctx.wallet.publicKey,
            treasury: treasuryState.treasury,
            dailyLimitCiphertext,
            perTxLimitCiphertext,
            spentTodayCiphertext,
          },
          now,
        );
        spinner.succeed("Scalar guardrails configured");

        if (ctx.output.json) {
          emitJson(ctx.output, {
            treasury: treasuryState.treasury,
            signature,
            dailyLimitCiphertext,
            perTxLimitCiphertext,
            spentTodayCiphertext,
          });
          return;
        }

        printSuccess(ctx.output, `Scalar guardrails configured: ${signature}`);
        return;
      }

      // Pre-created ciphertext path
      const now = Math.floor(Date.now() / 1000);

      if (ctx.dryRun) {
        const instruction = await ctx.client.configureConfidentialGuardrailsInstruction(
          {
            owner: ctx.wallet.publicKey,
            treasury: treasuryState.treasury,
            dailyLimitCiphertext,
            perTxLimitCiphertext,
            spentTodayCiphertext,
          },
          now,
        );
        emitJson(ctx.output, {
          action: "confidential.guardrails.scalar",
          treasury: treasuryState.treasury,
          instruction: serializeInstruction(instruction),
        });
        return;
      }

      const spinner = startSpinner(ctx.output, "Configuring scalar guardrails...");
      const signature = await ctx.client.configureConfidentialGuardrails(
        ctx.wallet,
        {
          owner: ctx.wallet.publicKey,
          treasury: treasuryState.treasury,
          dailyLimitCiphertext,
          perTxLimitCiphertext,
          spentTodayCiphertext,
        },
        now,
      );
      spinner.succeed("Scalar guardrails configured");

      if (ctx.output.json) {
        emitJson(ctx.output, { treasury: treasuryState.treasury, signature });
        return;
      }

      printSuccess(ctx.output, `Scalar guardrails configured: ${signature}`);
    });

  guardrails
    .command("vector")
    .description("Attach a vector guardrail ciphertext account")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--guardrail-ciphertext <pubkey>", "guardrail vector ciphertext account")
    .action(async function confidentialGuardrailsVector() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to configure vector guardrails.");
      }

      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });
      const existing = treasuryState.account.confidentialGuardrails?.guardrailVectorCiphertext;
      const guardrailVectorCiphertext = parsePublicKey(
        await promptString(
          typeof options["guardrailCiphertext"] === "string"
            ? options["guardrailCiphertext"]
            : existing?.toBase58(),
          "Guardrail vector ciphertext",
        ),
        "Guardrail vector ciphertext",
      );
      const now = Math.floor(Date.now() / 1000);

      if (ctx.dryRun) {
        const instruction = await ctx.client.configureConfidentialVectorGuardrailsInstruction(
          {
            owner: ctx.wallet.publicKey,
            treasury: treasuryState.treasury,
            guardrailVectorCiphertext,
          },
          now,
        );
        emitJson(ctx.output, {
          action: "confidential.guardrails.vector",
          treasury: treasuryState.treasury,
          instruction: serializeInstruction(instruction),
        });
        return;
      }

      const spinner = startSpinner(ctx.output, "Configuring vector guardrails...");
      const signature = await ctx.client.configureConfidentialVectorGuardrails(
        ctx.wallet,
        {
          owner: ctx.wallet.publicKey,
          treasury: treasuryState.treasury,
          guardrailVectorCiphertext,
        },
        now,
      );
      spinner.succeed("Vector guardrails configured");

      if (ctx.output.json) {
        emitJson(ctx.output, { treasury: treasuryState.treasury, signature });
        return;
      }

      printSuccess(ctx.output, `Vector guardrails configured: ${signature}`);
    });

  confidential
    .command("status")
    .description("Show confidential guardrails and pending confidential state")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .action(async function confidentialStatus() {
      const ctx = buildCliContext(this);
      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });
      const sections = renderTreasurySections(treasuryState.treasury, treasuryState.account);

      if (ctx.output.json) {
        emitJson(ctx.output, {
          treasury: treasuryState.treasury,
          guardrails: treasuryState.account.confidentialGuardrails,
          pending: treasuryState.account.pending,
        });
        return;
      }

      printBanner(ctx.output, `Confidential: ${treasuryState.account.agentId}`);
      if (sections.confidential) {
        console.log(sections.confidential);
      } else {
        console.log("No confidential guardrails configured.");
      }
      if (sections.pending) {
        console.log("");
        console.log(sections.pending);
      }
    });

  confidential
    .command("propose")
    .description("Propose a confidential scalar transaction")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--amount <usd>", "amount in USD — auto-encrypted via Ika Encrypt", Number)
    .option("--chain <name|number>", "target chain")
    .option("--recipient <address>", "recipient address or contract")
    .option("--tx-type <type>", "transaction type")
    .option("--protocol-id <id>", "protocol ID", Number)
    .option("--expected-output <usd>", "expected output in USD", Number)
    .option("--actual-output <usd>", "actual output in USD", Number)
    .option("--quote-age <secs>", "quote age in seconds", Number)
    .option("--counterparty-risk <score>", "counterparty risk score", Number)
    .option("--amount-ciphertext <pubkey>", "use a pre-created verified Encrypt ciphertext instead of auto-encrypting")
    .option("--policy-output-keypair <path>", "optional keypair path for the output ciphertext")
    .option("--wait", "wait until the policy output ciphertext is verified")
    .action(async function confidentialPropose() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to submit a confidential proposal.");
      }

      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });
      const guardrails = resolveScalarGuardrails(treasuryState.account);
      const amountUsd = await promptNumber(
        typeof options["amount"] === "number" ? options["amount"] : undefined,
        "Amount (USD)",
        { validate: (value) => { if (value <= 0) throw new Error("Amount must be > 0"); } },
      );
      const chain = await promptChain(
        typeof options["chain"] === "string" || typeof options["chain"] === "number"
          ? (options["chain"] as string | number)
          : undefined,
        "Chain",
      );
      const recipient = await promptString(
        typeof options["recipient"] === "string" ? options["recipient"] : undefined,
        "Recipient",
      );
      const txType = await promptTransactionType(
        typeof options["txType"] === "string" || typeof options["txType"] === "number"
          ? (options["txType"] as string | number)
          : undefined,
        "Transaction type",
      );
      const args = buildProposeConfidentialArgs({
        amountUsd,
        chain,
        txType,
        recipient,
        protocolId: typeof options["protocolId"] === "number" ? options["protocolId"] : undefined,
        expectedOutputUsd:
          typeof options["expectedOutput"] === "number" ? options["expectedOutput"] : undefined,
        actualOutputUsd:
          typeof options["actualOutput"] === "number" ? options["actualOutput"] : undefined,
        quoteAgeSecs: typeof options["quoteAge"] === "number" ? options["quoteAge"] : undefined,
        counterpartyRiskScore:
          typeof options["counterpartyRisk"] === "number"
            ? options["counterpartyRisk"]
            : undefined,
      });
      const policyOutputSigner = buildDryRunKeypair(
        typeof options["policyOutputKeypair"] === "string"
          ? options["policyOutputKeypair"]
          : undefined,
        loadKeypair,
      );
      const encryptAccounts = deriveEncryptAccounts(ctx.wallet.publicKey, {
        auraProgramId: ctx.programId,
      });

      if (ctx.dryRun) {
        emitJson(ctx.output, {
          action: "confidential.propose",
          treasury: treasuryState.treasury,
          policyOutputCiphertext: policyOutputSigner.publicKey,
          encryptAccounts,
          args,
          note: typeof options["amountCiphertext"] === "string"
            ? "using pre-created amount ciphertext"
            : "would auto-encrypt amount via Ika Encrypt gRPC",
        });
        return;
      }

      const spinner = startSpinner(ctx.output, "Ensuring Encrypt deposit account...");
      await ensureEncryptDeposit({
        connection: ctx.connection,
        payer: ctx.wallet,
        auraProgramId: ctx.programId,
      });

      // Resolve the amount ciphertext — auto-encrypt if not provided
      let amountCiphertext: PublicKey;
      if (typeof options["amountCiphertext"] === "string") {
        amountCiphertext = parsePublicKey(options["amountCiphertext"], "Amount ciphertext");
      } else {
        spinner.setText(`Encrypting amount (${amountUsd} USD) via Ika Encrypt...`);
        amountCiphertext = await encryptU64(amountUsd, ctx.programId);
        spinner.setText("Waiting for amount ciphertext to be verified on-chain...");
        await waitForCiphertextVerified(ctx.connection, amountCiphertext);
      }

      const instruction = await ctx.client.proposeConfidentialTransactionInstruction(
        {
          aiAuthority: ctx.wallet.publicKey,
          treasury: treasuryState.treasury,
          dailyLimitCiphertext: guardrails.dailyLimitCiphertext,
          perTxLimitCiphertext: guardrails.perTxLimitCiphertext,
          spentTodayCiphertext: guardrails.spentTodayCiphertext,
          amountCiphertext,
          policyOutputCiphertext: policyOutputSigner.publicKey,
          encryptProgram: encryptAccounts.encryptProgram,
          config: encryptAccounts.config,
          deposit: encryptAccounts.deposit,
          callerProgram: ctx.programId,
          cpiAuthority: encryptAccounts.cpiAuthority,
          networkEncryptionKey: encryptAccounts.networkEncryptionKey,
          eventAuthority: encryptAccounts.eventAuthority,
          systemProgram: SystemProgram.programId,
        },
        args,
      );
      markInstructionSigner(instruction, policyOutputSigner.publicKey);

      spinner.setText("Submitting confidential proposal...");
      const signature = await sendPreparedInstruction({
        ctx,
        instruction,
        extraSigners: [policyOutputSigner],
      });
      if (options["wait"] === true) {
        spinner.setText("Waiting for output ciphertext verification...");
        await waitForCiphertextVerified(ctx.connection, policyOutputSigner.publicKey);
      }
      spinner.succeed("Confidential proposal submitted");

      if (ctx.output.json) {
        emitJson(ctx.output, {
          treasury: treasuryState.treasury,
          signature,
          amountCiphertext,
          policyOutputCiphertext: policyOutputSigner.publicKey,
        });
        return;
      }

      printSuccess(
        ctx.output,
        `Confidential proposal submitted: ${signature}\n  amount ciphertext: ${amountCiphertext.toBase58()}\n  output ciphertext: ${policyOutputSigner.publicKey.toBase58()}`,
      );
    });

  confidential
    .command("request-decryption")
    .description("Request Encrypt decryption for the pending policy output")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--ciphertext <pubkey>", "override the pending policy output ciphertext")
    .option("--request-keypair <path>", "optional keypair path for the decryption request account")
    .option("--wait", "wait until the plaintext is ready on-chain")
    .action(async function confidentialRequestDecryption() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to request policy decryption.");
      }

      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });
      const ciphertext =
        typeof options["ciphertext"] === "string"
          ? parsePublicKey(options["ciphertext"], "Ciphertext")
          : resolvePendingPolicyOutput(treasuryState.account);
      const requestSigner = buildDryRunKeypair(
        typeof options["requestKeypair"] === "string"
          ? options["requestKeypair"]
          : undefined,
        loadKeypair,
      );
      const encryptAccounts = deriveEncryptAccounts(ctx.wallet.publicKey, {
        auraProgramId: ctx.programId,
      });
      const now = Math.floor(Date.now() / 1000);
      const instruction = await ctx.client.requestPolicyDecryptionInstruction(
        {
          operator: ctx.wallet.publicKey,
          treasury: treasuryState.treasury,
          requestAccount: requestSigner.publicKey,
          ciphertext,
          encryptProgram: encryptAccounts.encryptProgram,
          config: encryptAccounts.config,
          deposit: encryptAccounts.deposit,
          callerProgram: ctx.programId,
          cpiAuthority: encryptAccounts.cpiAuthority,
          networkEncryptionKey: encryptAccounts.networkEncryptionKey,
          eventAuthority: encryptAccounts.eventAuthority,
          systemProgram: SystemProgram.programId,
        },
        now,
      );
      markInstructionSigner(instruction, requestSigner.publicKey);

      if (ctx.dryRun) {
        emitJson(ctx.output, {
          action: "confidential.request-decryption",
          treasury: treasuryState.treasury,
          ciphertext,
          requestAccount: requestSigner.publicKey,
          instruction: serializeInstruction(instruction),
        });
        return;
      }

      const spinner = startSpinner(ctx.output, "Ensuring Encrypt deposit account...");
      const depositResult = await ensureEncryptDeposit({
        connection: ctx.connection,
        payer: ctx.wallet,
        auraProgramId: ctx.programId,
      });
      spinner.setText("Submitting decryption request...");
      const signature = await sendPreparedInstruction({
        ctx,
        instruction,
        extraSigners: [requestSigner],
      });
      if (options["wait"] === true) {
        spinner.setText("Waiting for decrypted plaintext...");
        await waitForDecryptionReady(ctx.connection, requestSigner.publicKey);
      }
      spinner.succeed("Policy decryption requested");

      if (ctx.output.json) {
        emitJson(ctx.output, {
          treasury: treasuryState.treasury,
          signature,
          requestAccount: requestSigner.publicKey,
          deposit: depositResult,
        });
        return;
      }

      printSuccess(
        ctx.output,
        `Policy decryption requested: ${signature} (request ${requestSigner.publicKey.toBase58()})`,
      );
    });

  confidential
    .command("confirm-decryption")
    .description("Confirm a completed policy decryption request on-chain")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--request-account <pubkey>", "override the pending decryption request account")
    .action(async function confidentialConfirmDecryption() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to confirm policy decryption.");
      }

      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });
      const requestAccount =
        typeof options["requestAccount"] === "string"
          ? parsePublicKey(options["requestAccount"], "Request account")
          : resolvePendingRequestAccount(treasuryState.account);
      const now = Math.floor(Date.now() / 1000);

      if (ctx.dryRun) {
        const instruction = await ctx.client.confirmPolicyDecryptionInstruction(
          {
            operator: ctx.wallet.publicKey,
            treasury: treasuryState.treasury,
            requestAccount,
          },
          now,
        );
        emitJson(ctx.output, {
          action: "confidential.confirm-decryption",
          treasury: treasuryState.treasury,
          requestAccount,
          instruction: serializeInstruction(instruction),
        });
        return;
      }

      const spinner = startSpinner(ctx.output, "Confirming policy decryption...");
      const signature = await ctx.client.confirmPolicyDecryption(
        ctx.wallet,
        {
          operator: ctx.wallet.publicKey,
          treasury: treasuryState.treasury,
          requestAccount,
        },
        now,
      );

      // Read the decrypted policy output from the Encrypt network to show the result
      let violationCode: bigint | null = null;
      try {
        spinner.setText("Reading decrypted policy result from Encrypt network...");
        const policyOutput = resolvePendingPolicyOutput(treasuryState.account);
        violationCode = await readU64Ciphertext(policyOutput, ctx.wallet.publicKey);
      } catch {
        // Non-fatal — the on-chain state is the source of truth
      }

      spinner.succeed("Policy decryption confirmed");

      const refreshed = await ctx.client.getTreasuryAccount(treasuryState.treasury);
      const decision = refreshed.pending?.decision;

      if (ctx.output.json) {
        emitJson(ctx.output, {
          treasury: treasuryState.treasury,
          requestAccount,
          signature,
          approved: decision?.approved ?? null,
          violation: decision?.violation ?? null,
          violationCode: violationCode !== null ? violationCode.toString() : null,
        });
        return;
      }

      const resultLine = decision
        ? decision.approved
          ? "approved ✓"
          : `denied — violation code ${violationCode ?? decision.violation}`
        : "";
      printSuccess(
        ctx.output,
        `Policy decryption confirmed: ${signature}${resultLine ? `\n  result: ${resultLine}` : ""}`,
      );
    });
}
