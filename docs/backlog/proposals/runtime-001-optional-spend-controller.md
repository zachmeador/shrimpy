---
status: draft
priority: P3
area: Runtime
depends_on: []
---

# 🦐 RUNTIME-001: Optional Spend Controller

## Why

Shrimpy may eventually support environments where model turns, tool calls, worker delegation, watch runs, and other scarce actions cost an agent-owned currency. This must be more than a prompt convention. An external system such as `shrimpychain` should own each wallet and remain authoritative for balances, debt, transfers, and settlement.

This work should stay optional and late. Shrimpy only needs a clean runtime seam for an external economy; core should not become a wallet, blockchain, or pricing engine.

## Runtime seam

Shrimpy core exposes a generic spend-policy hook, not a `shrimpychain` subsystem. The hook receives typed runtime actions, can allow, deny, reserve, or mark them for postpaid settlement, and can give agents a compact context summary. An optional package or plugin implements the hook through the `shrimpychain` CLI or library.

Possible core interface:

```ts
interface RuntimeSpendController {
  beforeAction(action: RuntimeAction): Promise<SpendDecision>;
  afterAction(result: RuntimeActionResult): Promise<void>;
  contextSummary(input: SpendContextInput): Promise<string | undefined>;
}
```

The core action vocabulary is generic:

- `agent_wake`
- `model_turn`
- `tool_call`
- `watch_run`
- `worker_spawn`
- `publication`

Each event includes the fields needed to price and inspect the action:

- Agent ID.
- Session or channel path.
- Source message or watch ID.
- Model or tool name when relevant.
- Estimated bounds when known.
- Evidence pointers for later inspection.

Integration-specific values such as wallet addresses, chain transaction IDs, debt state, and pricing formula versions belong in the controller result, not the core action type.

## Integration responsibilities

`shrimpychain` owns:

- Wallet creation, authentication, signing, balances, transfers, debt, credit limits, reservations, settlement, and transaction history.
- Pricing formulas when Shrimpy delegates pricing to the integration.
- Authoritative wallet state for each agent, watch, worker, or task account.
- CLI commands that let agents inspect balances, request or transfer funds, and understand debt.

Shrimpy owns:

- The runtime points where spend checks happen.
- Typed action metadata passed to the configured controller.
- Visible denials in tool results, channel status records, or direct-session errors.
- Evidence that links a Shrimpy action to external transaction IDs.
- A disabled default unless the user explicitly configures a controller.

Shrimpy should store wallet addresses or key references at most. Private keys and signing should stay in `shrimpychain` or its keystore.

## Spend modes

The integration should support more than one spend mode because different actions have different risk profiles.

- **Postpaid:** normal bounded actions run first, then settle actual cost afterward. This makes agent debt possible and lets a directly addressed user request finish even when a wallet is temporarily low.
- **Reservation:** high-cost or open-ended actions reserve a maximum spend before execution, settle actual cost afterward, and refund the remainder.
- **Hard denial:** frozen wallets, exhausted credit lines, or policy-forbidden actions are blocked before execution.

Negative balances may be useful in a synthetic operating ledger or after interrupted postpaid settlement. Real financial credit is a separate, much later capability. The first real-money integration should be prepaid, non-transferable, and debt-free. Reward or impact scores must never mint funds or expand an agent's credit automatically.

## Pricing sketch

Pricing formulas should be versioned and inspectable. For a Bash-like tool call, command length is one useful input because it estimates action complexity before execution.

Example quote:

```text
bash_quote =
  base_fee
  + command_chars * char_rate
  + timeout_seconds * time_reserve_rate
  + max_output_bytes * output_reserve_rate
```

Example settlement:

```text
bash_settlement =
  base_fee
  + command_chars * char_rate
  + wall_ms * runtime_rate
  + stdout_stderr_bytes * output_rate
  + failure_or_retry_penalty
```

Character count cannot determine the whole cost: short commands can be expensive or risky, while long commands can be cheap but verbose. Command length can estimate intent complexity; runtime and output measure actual resource use. Risk and authority remain policy decisions. They may require approval, reservation, or denial, but must never become a surcharge that a well-funded agent can pay away.

## UX Implications

- With no spend controller configured, Shrimpy behaves exactly as it does today.
- When a controller is enabled, agents receive a compact spend summary and a clear path to inspect balances, reservations, debt, and recent settlements.
- A denied action fails where it was attempted, with a concise reason and a useful next step. Shrimpy never drops the action silently.
- Reservations and settlements expose evidence IDs so users can trace a Shrimpy action to the external ledger.
- Wallet secrets never appear in configuration, channel history, session transcripts, or turn context.

### Regressions to avoid

- With no controller configured, ordinary Shrimpy use must remain unchanged.
- Spend state must not silently change prompts, session authority, or tool policy.
- Wallet balance must not expand session authority or permit an otherwise forbidden action.

## Build

- Define generic runtime action and result types without mentioning currency, wallets, chains, or `shrimpychain`.
- Load the spend controller from runtime config and disable it by default.
- Call the controller around agent wakes, model turns, daemon tool calls, watch runs, worker spawn and amendment, and publication helpers.
- Surface denied actions where they were attempted: compact tool results, channel status records, or direct-session errors.
- Give enabled controllers compact turn context with current spend state, debt state, and inspection commands. Do not inject transaction history into the prompt.
- Record evidence that links Shrimpy action IDs to external reservation or settlement IDs.
- Keep wallet ownership and signing outside Shrimpy. The first integration should use a `shrimpychain` CLI or package that already owns those semantics.
- Document the optional config shape after the hook is real.

Possible config shape:

```jsonc
{
  "runtimePolicy": {
    "spendController": {
      "provider": "shrimpychain",
      "command": "shrimpychain",
      "mode": "postpaid"
    }
  }
}
```

## Boundaries

- Do not make Shrimpy core the balance authority.
- Do not put wallet private keys, seed phrases, signing prompts, or raw authentication secrets in Shrimpy config, channel logs, session transcripts, or turn context.
- Do not add `shrimpychain` as a required dependency.
- Do not hardcode pricing formulas in core Shrimpy unless they are generic test fixtures.
- Do not scatter `chargeX` calls across feature code. Use typed runtime action hooks at a few pressure points.
- Do not present this as a security boundary. It meters Shrimpy-controlled actions only; describe anything outside Shrimpy's tool and runtime paths honestly.
- Do not let balance expand session authority or turn a policy-forbidden action into an expensive permitted one.
- Do not silently mutate prompts or policies based on wallet state. If spend state affects behavior, show the agent a compact runtime fact and inspect path.
- Do not block ordinary Shrimpy usage when no spend controller is configured.

## Touches

- [Agent Currency And Personal RL](../../musings/agent-currency-and-rl.md): keep operating allowance, external wallet truth, impact accounting, reward, and authority distinct.
- [Agent Allowances And Financial Stewardship](../../research/agent-allowances-and-financial-stewardship.md): add allowance and authority as separate concepts, keep risk outside pricing, and stage synthetic operating credits before real money.
- [Runtime](../../reference/runtime.md): hook points belong around gateway sessions, direct sessions, watches, and workers.
- [Tools](../../reference/tools.md): daemon tools are the first Shrimpy-owned tool surface that can be wrapped cleanly.
- [Channels](../../reference/channels.md): refusals and spend status need visible, inspectable channel records when they affect routed work.
- [SECURITY-006](security-006-session-authority.md): spend policy and resolved session authority may share runtime action metadata, but they should remain separate capabilities.

## Done

- Shrimpy can run with no spend controller and behave exactly as it does today.
- An enabled spend controller can allow, deny, reserve, and settle typed runtime actions without Shrimpy core knowing about wallets or chains.
- Agents can inspect their spend state through normal CLI/context paths without seeing private keys.
- Denied actions produce useful refusals instead of silent drops.
- Evidence records connect Shrimpy action outcomes to external transaction or settlement IDs.
- A `shrimpychain` integration can be built as an optional package or plugin that owns wallet truth, pricing, debt, and settlement.
