import { accounts, instructions } from "@aura-protocol/sdk-ts";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import type { Command } from "commander";

import { buildCliContext, type CliContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { runInstructions } from "../core/runner.js";
import { loadKeypair } from "../core/wallet.js";
import { encryptU64, encryptU64Batch, readU64Ciphertext } from "../lib/ika.js";
import {
  buildDryRunKeypair,
  deriveEncryptAccounts,
  ensureEncryptDeposit,
  getActivePendingProposal,
  markInstructionSigner,
  resolvePendingPolicyOutput,
  resolvePendingRequestAccount,
  resolveScalarGuardrails,
  waitForCiphertextVerified,
  waitForDecryptionReady,
} from "../lib/protocol.js";
import { renderTreasurySections } from "../lib/treasury-view.js";
import {
  emitJson,
  printBanner,
  printInfo,
  printNote,
  printSuccess,
  startSpinner,
} from "../ui/output.js";
import { style } from "../ui/theme.js";
import {
  buildProposeConfidentialArgs,
  promptChain,
  promptNumber,
  promptString,
  promptTransactionType,
  resolveTreasuryAccount,
} from "./helpers.js";

function requireWallet(ctx: CliContext) {
  if (!ctx.wallet) {
    throw new CliError("A wallet is required for this command.", {
      code: "WALLET_REQUIRED",
      tip: "Run `aura config init` or pass --wallet <path>.",
    });
  }
  return ctx.wallet;
}

function parsePublicKey(value: string, label: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw CliError.invalidInput(label, "base58 public key");
  }
}

function nowBn(): BN {
  return new BN(Math.floor(Date.now() / 1000));
}

export function registerConfidentialCommands(program: Command): void {
  const confidential = program
    .command("confidential")
    .description(
      "Manage confidential guardrails and the policy decryption flow",
    );

  // --- deposit ---------------------------------------------------------
  const deposit = confidential
    .command("deposit")
    .description("Manage Encrypt deposit accounts");

  deposit
    .command("ensure")
    .description("Ensure the configured wallet has an Encrypt deposit account")
    .action(async function confidentialDepositEnsure() {
      const ctx = buildCliContext(this);
      const wallet = requireWallet(ctx);
      const derived = deriveEncryptAccounts(wallet.publicKey, {
        auraProgramId: ctx.programId,
      });

      if (ctx.dryRun) {
        if (ctx.output.json) {
          emitJson(ctx.output, {
            action: "confidential.deposit.ensure",
            accounts: derived,
          });
        } else {
          printNote(
            ctx.output,
            `Dry run: would ensure Encrypt deposit ${derived.deposit.toBase58()}`,
          );
        }
        return;
      }

      const spinner = startSpinner(
        ctx.output,
        "Ensuring Encrypt deposit account...",
      );
      const result = await ensureEncryptDeposit({
        connection: ctx.connection,
        payer: wallet,
        auraProgramId: ctx.programId,
      });
      spinner.succeed(
        result.created ? "Encrypt deposit created" : "Encrypt deposit ready",
      );

      if (ctx.output.json) {
        emitJson(ctx.output, result);
        return;
      }
      printSuccess(
        ctx.output,
        `${result.created ? "Encrypt deposit created" : "Encrypt deposit ready"}: ${result.accounts.deposit.toBase58()}`,
      );
    });

  // --- guardrails ------------------------------------------------------
  const guardrails = confidential
    .command("guardrails")
    .description("Configure confidential guardrail ciphertexts");

  guardrails
    .command("scalar")
    .description(
      "Attach scalar guardrail ciphertext accounts (auto-encrypts via Ika Encrypt)",
    )
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--daily-limit <usd>", "daily limit in USD", Number)
    .option("--per-tx-limit <usd>", "per-transaction limit in USD", Number)
    .option(
      "--spent-today <usd>",
      "current spent-today counter in USD (default 0)",
      Number,
    )
    .option(
      "--daily-limit-ciphertext <pubkey>",
      "use a pre-created daily limit ciphertext",
    )
    .option(
      "--per-tx-ciphertext <pubkey>",
      "use a pre-created per-tx limit ciphertext",
    )
    .option(
      "--spent-today-ciphertext <pubkey>",
      "use a pre-created spent-today ciphertext",
    )
    .action(async function confidentialGuardrailsScalar() {
      const ctx = buildCliContext(this);
      const wallet = requireWallet(ctx);
      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId:
          typeof options.agentId === "string" ? options.agentId : undefined,
        treasury:
          typeof options.treasury === "string" ? options.treasury : undefined,
      });

      const usingPreCreated =
        typeof options.dailyLimitCiphertext === "string" &&
        typeof options.perTxCiphertext === "string" &&
        typeof options.spentTodayCiphertext === "string";

      let dailyLimitCiphertext: PublicKey;
      let perTxLimitCiphertext: PublicKey;
      let spentTodayCiphertext: PublicKey;

      if (usingPreCreated) {
        dailyLimitCiphertext = parsePublicKey(
          options.dailyLimitCiphertext as string,
          "daily-limit-ciphertext",
        );
        perTxLimitCiphertext = parsePublicKey(
          options.perTxCiphertext as string,
          "per-tx-ciphertext",
        );
        spentTodayCiphertext = parsePublicKey(
          options.spentTodayCiphertext as string,
          "spent-today-ciphertext",
        );
      } else {
        const dailyLimit = await promptNumber(
          typeof options.dailyLimit === "number"
            ? options.dailyLimit
            : undefined,
          "Daily limit (USD)",
          {
            validate: (v) => {
              if (v <= 0) throw new Error("Must be > 0");
            },
          },
        );
        const perTxLimit = await promptNumber(
          typeof options.perTxLimit === "number"
            ? options.perTxLimit
            : undefined,
          "Per-transaction limit (USD)",
          {
            validate: (v) => {
              if (v <= 0) throw new Error("Must be > 0");
            },
          },
        );
        const spentToday =
          typeof options.spentToday === "number" ? options.spentToday : 0;

        if (ctx.dryRun) {
          printNote(
            ctx.output,
            `Dry run: would encrypt daily=$${dailyLimit}, per-tx=$${perTxLimit}, spent=$${spentToday} via Ika Encrypt, then configure scalar guardrails.`,
          );
          return;
        }

        const spinner = startSpinner(
          ctx.output,
          "Encrypting guardrail values via Ika Encrypt...",
        );
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
        spinner.succeed("Ciphertexts verified");
        dailyLimitCiphertext = daily;
        perTxLimitCiphertext = perTx;
        spentTodayCiphertext = spent;
      }

      const instruction =
        await instructions.confidential.configureConfidentialGuardrails(
          ctx.client,
          {
            accounts: {
              owner: wallet.publicKey,
              treasury: treasuryState.treasury,
              dailyLimitCiphertext,
              perTxLimitCiphertext,
              spentTodayCiphertext,
            },
            args: { now: nowBn() },
          },
        );

      await runInstructions(ctx, [instruction], {
        action: "Configure scalar guardrails",
        instructionName: "configure_confidential_guardrails",
        result: {
          treasury: treasuryState.treasury,
          dailyLimitCiphertext,
          perTxLimitCiphertext,
          spentTodayCiphertext,
        },
      });
    });

  // --- status ----------------------------------------------------------
  confidential
    .command("status")
    .description("Show confidential guardrails and pending confidential state")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .action(async function confidentialStatus() {
      const ctx = buildCliContext(this);
      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId:
          typeof options.agentId === "string" ? options.agentId : undefined,
        treasury:
          typeof options.treasury === "string" ? options.treasury : undefined,
      });
      const sections = renderTreasurySections(
        treasuryState.treasury,
        treasuryState.account,
      );

      if (ctx.output.json) {
        emitJson(ctx.output, {
          treasury: treasuryState.treasury,
          guardrails: treasuryState.account.confidentialGuardrails,
          pending: getActivePendingProposal(treasuryState.account),
        });
        return;
      }

      printBanner(ctx.output, `Confidential: ${treasuryState.account.agentId}`);
      console.log(
        sections.confidential ??
          style.muted("No confidential guardrails configured."),
      );
      if (sections.pending) {
        console.log("");
        console.log(sections.pending);
      }
    });

  // --- propose ---------------------------------------------------------
  confidential
    .command("propose")
    .description("Propose a confidential scalar transaction")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option(
      "--amount <usd>",
      "amount in USD — auto-encrypted via Ika Encrypt",
      Number,
    )
    .option("--chain <name|number>", "target chain")
    .option("--recipient <address>", "recipient address or contract")
    .option("--tx-type <type>", "transaction type")
    .option("--protocol-id <id>", "protocol ID", Number)
    .option("--expected-output <usd>", "expected output in USD", Number)
    .option("--actual-output <usd>", "actual output in USD", Number)
    .option("--quote-age <secs>", "quote age in seconds", Number)
    .option("--counterparty-risk <score>", "counterparty risk score", Number)
    .option(
      "--amount-ciphertext <pubkey>",
      "use a pre-created verified Encrypt ciphertext",
    )
    .option(
      "--policy-output-keypair <path>",
      "keypair path for the output ciphertext account",
    )
    .option("--wait", "wait until the policy output ciphertext is verified")
    .action(async function confidentialPropose() {
      const ctx = buildCliContext(this);
      const wallet = requireWallet(ctx);
      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId:
          typeof options.agentId === "string" ? options.agentId : undefined,
        treasury:
          typeof options.treasury === "string" ? options.treasury : undefined,
      });
      const guardrails = resolveScalarGuardrails(treasuryState.account);

      const amountUsd = await promptNumber(
        typeof options.amount === "number" ? options.amount : undefined,
        "Amount (USD)",
        {
          validate: (v) => {
            if (v <= 0) throw new Error("Amount must be > 0");
          },
        },
      );
      const chain = await promptChain(
        typeof options.chain === "string" || typeof options.chain === "number"
          ? (options.chain as string | number)
          : undefined,
        "Chain",
      );
      const recipient = await promptString(
        typeof options.recipient === "string" ? options.recipient : undefined,
        "Recipient",
      );
      const txType = await promptTransactionType(
        typeof options.txType === "string" || typeof options.txType === "number"
          ? (options.txType as string | number)
          : undefined,
        "Transaction type",
      );
      const args = buildProposeConfidentialArgs({
        amountUsd,
        chain,
        txType,
        recipient,
        protocolId:
          typeof options.protocolId === "number"
            ? options.protocolId
            : undefined,
        expectedOutputUsd:
          typeof options.expectedOutput === "number"
            ? options.expectedOutput
            : undefined,
        actualOutputUsd:
          typeof options.actualOutput === "number"
            ? options.actualOutput
            : undefined,
        quoteAgeSecs:
          typeof options.quoteAge === "number" ? options.quoteAge : undefined,
        counterpartyRiskScore:
          typeof options.counterpartyRisk === "number"
            ? options.counterpartyRisk
            : undefined,
      });

      if (ctx.dryRun) {
        printNote(
          ctx.output,
          "Dry run: would ensure an Encrypt deposit, encrypt the amount via Ika, then submit propose_confidential_transaction.",
        );
        if (ctx.output.json) {
          emitJson(ctx.output, {
            action: "confidential.propose",
            treasury: treasuryState.treasury,
            args,
          });
        }
        return;
      }

      const policyOutputSigner = buildDryRunKeypair(
        typeof options.policyOutputKeypair === "string"
          ? options.policyOutputKeypair
          : undefined,
        loadKeypair,
      );
      const encryptAccounts = deriveEncryptAccounts(wallet.publicKey, {
        auraProgramId: ctx.programId,
      });

      const spinner = startSpinner(
        ctx.output,
        "Ensuring Encrypt deposit account...",
      );
      await ensureEncryptDeposit({
        connection: ctx.connection,
        payer: wallet,
        auraProgramId: ctx.programId,
      });

      let amountCiphertext: PublicKey;
      if (typeof options.amountCiphertext === "string") {
        amountCiphertext = parsePublicKey(
          options.amountCiphertext,
          "amount-ciphertext",
        );
      } else {
        spinner.setText(`Encrypting amount ($${amountUsd}) via Ika Encrypt...`);
        amountCiphertext = await encryptU64(amountUsd, ctx.programId);
        spinner.setText(
          "Waiting for amount ciphertext to be verified on-chain...",
        );
        await waitForCiphertextVerified(ctx.connection, amountCiphertext);
      }
      spinner.succeed("Amount ciphertext ready");

      const instruction =
        await instructions.confidential.proposeConfidentialTransaction(
          ctx.client,
          {
            accounts: {
              aiAuthority: wallet.publicKey,
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
              externalLiveness: null,
              weeklyLimitCiphertext: null,
              weeklySpentCiphertext: null,
              confidentialGuardrails: null,
              systemProgram: SystemProgram.programId,
            },
            args,
          },
        );
      // The freshly created output ciphertext account must sign its own creation.
      markInstructionSigner(instruction, policyOutputSigner.publicKey);

      const outcome = await runInstructions(ctx, [instruction], {
        action: "Propose confidential transaction",
        instructionName: "propose_confidential_transaction",
        extraSigners: [policyOutputSigner],
        computeUnits: 1_400_000,
        heapFrameBytes: 256 * 1024,
        summary: [
          ["amount ct", amountCiphertext.toBase58()],
          ["output ct", policyOutputSigner.publicKey.toBase58()],
        ],
        result: {
          treasury: treasuryState.treasury,
          amountCiphertext,
          policyOutputCiphertext: policyOutputSigner.publicKey,
        },
      });

      if (outcome.signature && options.wait === true) {
        const waitSpinner = startSpinner(
          ctx.output,
          "Waiting for output ciphertext verification...",
        );
        await waitForCiphertextVerified(
          ctx.connection,
          policyOutputSigner.publicKey,
        );
        waitSpinner.succeed("Output ciphertext verified");
      }
    });

  // --- request-decryption ---------------------------------------------
  confidential
    .command("request-decryption")
    .description("Request Encrypt decryption for the pending policy output")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option(
      "--ciphertext <pubkey>",
      "override the pending policy output ciphertext",
    )
    .option(
      "--request-keypair <path>",
      "keypair path for the decryption request account",
    )
    .option("--wait", "wait until the plaintext is ready on-chain")
    .action(async function confidentialRequestDecryption() {
      const ctx = buildCliContext(this);
      const wallet = requireWallet(ctx);
      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId:
          typeof options.agentId === "string" ? options.agentId : undefined,
        treasury:
          typeof options.treasury === "string" ? options.treasury : undefined,
      });
      const ciphertext =
        typeof options.ciphertext === "string"
          ? parsePublicKey(options.ciphertext, "ciphertext")
          : resolvePendingPolicyOutput(treasuryState.account);

      if (ctx.dryRun) {
        printNote(
          ctx.output,
          "Dry run: would ensure an Encrypt deposit and submit request_policy_decryption.",
        );
        if (ctx.output.json) {
          emitJson(ctx.output, {
            action: "confidential.request-decryption",
            treasury: treasuryState.treasury,
            ciphertext,
          });
        }
        return;
      }

      const requestSigner = buildDryRunKeypair(
        typeof options.requestKeypair === "string"
          ? options.requestKeypair
          : undefined,
        loadKeypair,
      );
      const encryptAccounts = deriveEncryptAccounts(wallet.publicKey, {
        auraProgramId: ctx.programId,
      });

      const spinner = startSpinner(
        ctx.output,
        "Ensuring Encrypt deposit account...",
      );
      await ensureEncryptDeposit({
        connection: ctx.connection,
        payer: wallet,
        auraProgramId: ctx.programId,
      });
      spinner.succeed("Encrypt deposit ready");

      const instruction =
        await instructions.confidential.requestPolicyDecryption(ctx.client, {
          accounts: {
            operator: wallet.publicKey,
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
            confidentialGuardrails: null,
            systemProgram: SystemProgram.programId,
          },
          args: { now: nowBn(), currentEpochId: new BN(0) },
        });
      markInstructionSigner(instruction, requestSigner.publicKey);

      const outcome = await runInstructions(ctx, [instruction], {
        action: "Request policy decryption",
        instructionName: "request_policy_decryption",
        extraSigners: [requestSigner],
        computeUnits: 1_400_000,
        heapFrameBytes: 256 * 1024,
        summary: [["request", requestSigner.publicKey.toBase58()]],
        result: {
          treasury: treasuryState.treasury,
          requestAccount: requestSigner.publicKey,
        },
      });

      if (outcome.signature && options.wait === true) {
        const waitSpinner = startSpinner(
          ctx.output,
          "Waiting for decrypted plaintext...",
        );
        await waitForDecryptionReady(ctx.connection, requestSigner.publicKey);
        waitSpinner.succeed("Plaintext ready");
      }
    });

  // --- confirm-decryption ---------------------------------------------
  confidential
    .command("confirm-decryption")
    .description("Confirm a completed policy decryption request on-chain")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option(
      "--request-account <pubkey>",
      "override the pending decryption request account",
    )
    .action(async function confidentialConfirmDecryption() {
      const ctx = buildCliContext(this);
      const wallet = requireWallet(ctx);
      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId:
          typeof options.agentId === "string" ? options.agentId : undefined,
        treasury:
          typeof options.treasury === "string" ? options.treasury : undefined,
      });
      const requestAccount =
        typeof options.requestAccount === "string"
          ? parsePublicKey(options.requestAccount, "request-account")
          : resolvePendingRequestAccount(treasuryState.account);

      const instruction =
        await instructions.confidential.confirmPolicyDecryption(ctx.client, {
          accounts: {
            operator: wallet.publicKey,
            treasury: treasuryState.treasury,
            requestAccount,
            confidentialGuardrails: null,
          },
          args: { now: nowBn(), currentEpochId: new BN(0) },
        });

      const outcome = await runInstructions(ctx, [instruction], {
        action: "Confirm policy decryption",
        instructionName: "confirm_policy_decryption",
        summary: [["request", requestAccount.toBase58()]],
        result: { treasury: treasuryState.treasury, requestAccount },
      });

      if (outcome.signature && !ctx.output.json) {
        let violationCode: bigint | null = null;
        try {
          violationCode = await readU64Ciphertext(
            resolvePendingPolicyOutput(treasuryState.account),
            wallet.publicKey,
          );
        } catch {
          // Non-fatal — on-chain state remains the source of truth.
        }
        try {
          const refreshed = await accounts.fetchTreasuryAccount(
            ctx.client,
            treasuryState.treasury,
          );
          const decision = getActivePendingProposal(refreshed)?.decision;
          if (decision) {
            printInfo(
              ctx.output,
              decision.approved
                ? style.success("result: approved")
                : style.danger(
                    `result: denied — violation code ${violationCode ?? decision.violation}`,
                  ),
            );
          }
        } catch {
          // Non-fatal.
        }
      }
    });
}
