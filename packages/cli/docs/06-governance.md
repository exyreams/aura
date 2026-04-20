# Governance Commands

## `aura governance multisig`

Configures an emergency guardian multisig on the treasury. Guardians can propose
and co-sign daily limit increases via the override flow.

```bash
aura governance multisig \
  --agent-id my-agent \
  --required 2 \
  --guardians pk1,pk2,pk3
```

```
  ⠸ Configuring multisig...
  ✓ Multisig configured: 4mVEbFAX...

  ┌──────────────────┬──────────────────────────────────────────────┐
  │  Required sigs   │  2 of 3                                      │
  │  Guardian 1      │  pk1...                                      │
  │  Guardian 2      │  pk2...                                      │
  │  Guardian 3      │  pk3...                                      │
  └──────────────────┴──────────────────────────────────────────────┘
```

### All Flags

```
--agent-id <id>          Treasury agent ID
--required <n>           Required signatures (must be > 0 and ≤ guardian count)
--guardians <pk,pk,...>  Comma-separated guardian pubkeys
```

---

## `aura governance swarm`

Configures an agent swarm with a shared spending pool. All member agents share
a collective `sharedPoolLimitUsd` enforced by the `shared_pool_limit` policy rule.

```bash
aura governance swarm \
  --agent-id my-agent \
  --swarm-id trading-swarm-alpha \
  --members agent-1,agent-2,agent-3 \
  --pool-limit 50000
```

```
  ✓ Swarm configured: 3mtpnWCJ...

  ┌──────────────────┬──────────────────────────────────────────────┐
  │  Swarm ID        │  trading-swarm-alpha                         │
  │  Members         │  3 agents                                    │
  │  Pool limit      │  $50,000.00                                  │
  └──────────────────┴──────────────────────────────────────────────┘
```

### All Flags

```
--agent-id <id>        Treasury agent ID
--swarm-id <id>        Unique swarm identifier
--members <id,id,...>  Comma-separated member agent IDs
--pool-limit <usd>     Shared pool limit in USD
```

---

## `aura governance override propose`

A guardian proposes raising the daily spending limit. Once enough guardians
co-sign (within a 1-hour expiry window), the new limit is applied on-chain.

```bash
aura governance override propose \
  --agent-id my-agent \
  --new-daily-limit 20000
```

```
  ✓ Override proposed: 4eWEcqjN...
    New daily limit: $20,000.00
    Expires in: 1 hour
    Signatures needed: 1 more
```

### All Flags

```
--agent-id <id>          Treasury agent ID
--new-daily-limit <usd>  Proposed new daily limit in USD
```

---

## `aura governance override collect`

A guardian co-signs an existing override proposal. When the required quorum is
reached, the new limit is applied immediately on-chain.

```bash
aura governance override collect --agent-id my-agent
```

**Before quorum:**

```
  Pending override:
  ┌──────────────────┬──────────────────────────────────────────────┐
  │  New daily limit │  $20,000.00                                  │
  │  Signatures      │  1 / 2                                       │
  │  Expires in      │  47m 12s                                     │
  └──────────────────┴──────────────────────────────────────────────┘

  ✓ Signature collected: 3v75Ee1k...
    1 more signature needed to apply the override
```

**Quorum reached:**

```
  ✓ Signature collected — quorum reached, override applied
    New daily limit: $20,000.00
```
