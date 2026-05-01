# PDA Utilities

The CLI can derive canonical AURA, policy-control, dWallet, and Encrypt PDAs
without loading a wallet or touching RPC.

```bash
aura pda treasury --owner <owner> --agent-id my-agent
aura pda dwallet-cpi-authority
aura pda encrypt-cpi-authority
aura pda encrypt-event-authority --encrypt-program-id <program>
```

## Policy-Control PDAs

```bash
aura pda policy-simulation --treasury <treasury> --simulation-id 1
aura pda policy-receipt --treasury <treasury> --proposal-id 42
aura pda budget-envelope --treasury <treasury> --envelope-id 7
aura pda operator-role --treasury <treasury> --operator <operator>
aura pda external-liveness --treasury <treasury>
aura pda policy-attestation --treasury <treasury> --attester <attester> --policy-version 3
aura pda batch-proposal --treasury <treasury> --batch-id 9
aura pda invariant-report --treasury <treasury> --report-id 10
```

Exposure groups are keyed by authority plus a 16-byte group ID:

```bash
aura pda exposure-group \
  --authority <authority> \
  --group-id 00112233445566778899aabbccddeeff
```

## dWallet Message Approval

```bash
aura pda message-approval \
  --curve 0 \
  --signature-scheme 5 \
  --public-key-hex <dwallet-public-key-hex> \
  --message-digest <32-byte-hex> \
  --message-metadata-digest <32-byte-hex>
```

The metadata digest is optional. If omitted, or if it is all zeroes, it is not
included in the PDA seeds.

## JSON Output

```bash
aura --json pda policy-receipt --treasury <treasury> --proposal-id 42
```

Returns:

```json
{
  "kind": "policy-receipt",
  "address": "...",
  "bump": 254,
  "programId": "...",
  "seeds": {
    "treasury": "...",
    "proposalId": "42"
  }
}
```
