"use client";

const LINES = [
  "createTreasury · proposeTransaction · executePending · finalizeExecution · pauseExecution · cancelPending · resubmitProposal · abandonProposal · confirmSettlement",
  "ViolationCode::DailyLimit · ViolationCode::PerTransactionLimit · ViolationCode::VelocityLimit · ViolationCode::CounterpartyRisk · ViolationCode::SlippageExceeded · ViolationCode::QuoteStale",
  'b"treasury" · b"__ika_cpi_authority" · b"__encrypt_cpi_authority" · b"__event_authority" · b"message_approval" · b"operator_role" · b"budget_envelope"',
  "evaluate_transaction · evaluate_public_precheck · evaluate_batch · PolicyDecision · PolicyState · ViolationCode · RuleOutcome · RiskFactor · REG_FLAG_CTR_THRESHOLD",
  "auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce · 4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8 · 87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY",
  "configureConfidentialGuardrails · proposeConfidentialTransaction · requestPolicyDecryption · confirmPolicyDecryption · resetConfidentialCounters · rotateConfidentialGuardrails",
  "AuraClient · deriveTreasuryAddress · getTreasuryAccount · sendInstructions · BNish · TreasuryAccountRecord · ProposeTransactionArgs · CreateTreasuryArgs",
  "initFeeSchedule · createBillingTemplate · applyBillingTemplate · collectFees · depositFees · withdrawUnusedFees · setFeeSplits · updateFeeRecipient · closeFeeVault",
  "startCanary · promoteCanary · discardCanary · simulatePolicy · rollbackPolicy · attestPolicy · writePolicyReceipt · configureTrustPolicy · checkInvariants",
  "registerAgent · revokeAgent · issueSessionKey · revokeSessionKey · grantOperatorRole · setAgentCapability · setAgentTripwires · transitionAgentState · triggerDeadMansSwitch",
  "scoped_pause · budget_envelope · exposure_group · approval_ladder · anomaly_detection · reputation_scaling · swarm_pool · liveness_config · session_key",
  "TreasuryError · AuraCoreError · SdkError · AuraErrorCode · InvalidAmount · UnauthorizedSigner · PolicyViolation · InsufficientFunds · ProposalExpired",
  "registerDwallet · removeDwallet · rotateDwalletAuthority · setDwalletLimits · reserveDwalletSpend · releaseDwalletSpend · settleDwalletSpend · refreshDwalletBalance",
  "anchor build · anchor deploy · cargo test --workspace · bun run dev · npm run typecheck · bun run vendor:sync · npm run generate-idl",
  "Bitcoin · Ethereum · Solana · Polygon · Arbitrum · Optimism · dWallet · Ika Encrypt · FHE · multi-chain · cross-chain · co-signing",
];

export function StreamingText() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Scrolling rows — full width, no horizontal padding so lines reach the edges */}
      <div
        className="relative w-full h-full font-mono text-[11px] text-(--text-main) flex flex-col justify-center gap-3"
        style={{ opacity: 0.1, paddingTop: "120px", paddingBottom: "120px" }}
      >
        {LINES.map((line, i) => {
          const dir = i % 2 === 0 ? "left" : "right";
          const duration = 28 + i * 4;
          const content = `${line} · ${line}`;
          // Use first 40 chars of line as a stable key — all lines are unique
          const key = line.slice(0, 40);
          return (
            <div key={key} className="overflow-hidden whitespace-nowrap w-full">
              <span
                style={{
                  display: "inline-block",
                  whiteSpace: "nowrap",
                  animation: `marquee-${dir} ${duration}s linear infinite`,
                  willChange: "transform",
                }}
              >
                {content}
              </span>
            </div>
          );
        })}
      </div>

      {/* Edge masks — sit above the text, fade it into the background */}

      {/* Top */}
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none z-10"
        style={{
          height: "160px",
          background:
            "linear-gradient(to bottom, var(--bg) 0%, transparent 100%)",
        }}
      />
      {/* Bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
        style={{
          height: "160px",
          background: "linear-gradient(to top, var(--bg) 0%, transparent 100%)",
        }}
      />
      {/* Left — wide soft fade */}
      <div
        className="absolute top-0 left-0 bottom-0 pointer-events-none z-10"
        style={{
          width: "18vw",
          background:
            "linear-gradient(to right, var(--bg) 0%, transparent 100%)",
        }}
      />
      {/* Right — wide soft fade */}
      <div
        className="absolute top-0 right-0 bottom-0 pointer-events-none z-10"
        style={{
          width: "18vw",
          background:
            "linear-gradient(to left, var(--bg) 0%, transparent 100%)",
        }}
      />

      <style>{`
        @keyframes marquee-left {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes marquee-right {
          from { transform: translateX(-50%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
