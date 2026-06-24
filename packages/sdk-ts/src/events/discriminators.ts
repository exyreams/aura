/** Generated event discriminators. Do not edit. */

export const EventDiscriminator = {
  executionLifecycleEvent: Buffer.from([170, 155, 187, 106, 242, 102, 71, 103]),
  policyReceiptWrittenEvent: Buffer.from([
    249, 94, 189, 203, 204, 160, 218, 227,
  ]),
  proposalLifecycleEvent: Buffer.from([198, 23, 28, 210, 232, 47, 7, 199]),
  treasuryAuditEvent: Buffer.from([209, 27, 57, 147, 169, 125, 166, 58]),
} as const;

export const EVENT_DISCRIMINATORS = EventDiscriminator;
