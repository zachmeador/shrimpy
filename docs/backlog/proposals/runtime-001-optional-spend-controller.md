# RUNTIME-001: Optional Spend Controller

Status: draft
Priority: P3
Area: Runtime

## Why

Shrimpy may eventually support environments where agents have real spend pressure: model turns, tool calls, worker delegation, watch runs, and other scarce actions can cost an agent-owned currency. The interesting version is not a prompt convention. Agents should legitimately own wallets through an external system such as `shrimpychain`, and Shrimpy should consult that system for balance, debt, transfer, and settlement truth when the feature is enabled.

This should stay optional and late. The goal is to define a clean runtime seam so the economy can exist without turning Shrimpy core into a wallet, blockchain, or pricing engine.

## Shape

Shrimpy core should expose a generic spend/policy hook, not a `shrimpychain` subsystem. The hook sees typed runtime actions, can allow, deny, reserve, or mark them for postpaid settlement, and can report a compact context summary for agents. A `shrimpychain` package or plugin can implement that hook by calling the `shrimpychain` CLI or library.

Possible core interface:

```ts
interface RuntimeSpendController {
  beforeAction(action: RuntimeAction): Promise<SpendDecision>;
  afterAction(result: RuntimeActionResult): Promise<void>;
  contextSummary(input: SpendContextInput): Promise<string | undefined>;
}
```

The action/event vocabulary should be generic:

- `agent_wake`
- `model_turn`
- `tool_call`
- `watch_run`
- `worker_spawn`
- `publication`

Each event should include agent id, session or channel path, source message or watch id, model or tool name when relevant, estimated bounds when known, and evidence pointers that can be inspected later. Shrimpychain-specific values such as wallet address, chain transaction id, debt state, and pricing formula version belong in the integration result, not in the core action type.

## Shrimpychain Role

`shrimpychain` owns:

- wallet creation, wallet auth, signing, balances, transfers, debt, credit limits, reservations, settlement, and transaction history
- pricing formulas when the feature is configured to delegate pricing externally
- wallet truth for each agent, watch, worker, or task account
- CLI commands agents can use to inspect balances, request funds, transfer funds, and understand debt

Shrimpy owns:

- deciding where runtime spend checks happen
- passing typed action metadata to the configured controller
- turning denials into visible tool results, channel status records, or direct-session errors
- recording evidence that links a Shrimpy action to external transaction ids
- keeping the feature disabled unless explicitly configured

Shrimpy should store wallet addresses or key references at most. Private keys and signing should stay in `shrimpychain` or its keystore.

## Spend Modes

The integration should support more than one spend mode because different actions have different risk profiles.

- **Postpaid:** normal bounded actions run first, then settle actual cost afterward. This makes agent debt possible and lets a directly addressed user request finish even when a wallet is temporarily low.
- **Reservation:** high-cost or open-ended actions reserve a maximum spend before execution, settle actual cost afterward, and refund the remainder.
- **Hard denial:** frozen wallets, exhausted credit lines, or policy-forbidden actions are blocked before execution.

Debt is a feature, not an accident. A useful agent can carry small debt and recover through later value. A reckless agent can become strained, delinquent, or frozen and lose discretionary privileges.

## Pricing Sketch

Pricing should be formula-versioned and inspectable. For a Bash-like tool call, command character length can be one useful input because it prices prompt/action complexity before execution.

Example quote:

```text
bash_quote =
  base_fee
  + command_chars * char_rate
  + timeout_seconds * time_reserve_rate
  + max_output_bytes * output_reserve_rate
  + risk_surcharge
```

Example settlement:

```text
bash_settlement =
  base_fee
  + command_chars * char_rate
  + wall_ms * runtime_rate
  + stdout_stderr_bytes * output_rate
  + failure_or_retry_penalty
  + risk_surcharge
```

Character length should not be the whole cost. Short commands can be expensive or risky, and long commands can be cheap but verbose. The better pressure is command length for intent complexity, runtime and output for actual resource use, and risk for policy-sensitive behavior.

## Build

- Define the generic runtime action/result types without mentioning currency, wallets, chains, or `shrimpychain`.
- Add a disabled-by-default spend controller loader to runtime config.
- Add hook points around agent wake, model turns, daemon tool calls, watch runs, worker spawn/amendment, and publication helpers.
- Add refusal plumbing that can surface denied actions as compact tool results, operation/status channel messages, or direct-session errors depending on where the action was attempted.
- Add compact turn-context reporting for enabled controllers, such as current spend state, debt state, and inspect commands, without dumping transaction history into the prompt.
- Add evidence records that link Shrimpy action ids to external reservation or settlement ids.
- Keep wallet ownership and signing outside Shrimpy. The first integration should call a `shrimpychain` CLI or package that already owns those semantics.
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
- Do not put wallet private keys, seed phrases, signing prompts, or raw auth secrets in Shrimpy config, channel logs, session transcripts, or turn context.
- Do not add `shrimpychain` as a required dependency.
- Do not hardcode pricing formulas in core Shrimpy unless they are generic test fixtures.
- Do not scatter `chargeX` calls across feature code. Use typed runtime action hooks at a few pressure points.
- Do not make this a fake security boundary. It meters Shrimpy-controlled actions; anything outside Shrimpy's tool/runtime path must be described honestly.
- Do not silently mutate prompts or policies based on wallet state. If spend state affects behavior, show the agent a compact runtime fact and inspect path.
- Do not block ordinary Shrimpy usage when no spend controller is configured.

## Touches

- [Agent Currency And Personal RL](../../musings/agent-currency-and-rl.md): keep the distinction between budget, currency, and reward, but let external wallet truth replace any local currency ledger.
- [Runtime](../../reference/runtime.md): hook points belong around gateway sessions, direct sessions, watches, and workers.
- [Tools](../../reference/tools.md): daemon tools are the first Shrimpy-owned tool surface that can be wrapped cleanly.
- [Channels](../../reference/channels.md): refusals and spend status need visible, inspectable channel records when they affect routed work.
- [CODE-004](code-004-agent-worker-tools.md): future worker tools should be spend-controller-aware if this feature exists by then.
- [SECURITY-001](../security-001-agent-sandboxing-security-strategy.md): spend policy and sandbox policy may share runtime action metadata, but they should remain separate capabilities.

## Done

- Shrimpy can run with no spend controller and behave exactly as it does today.
- An enabled spend controller can allow, deny, reserve, and settle typed runtime actions without Shrimpy core knowing about wallets or chains.
- Agents can inspect their spend state through normal CLI/context paths without seeing private keys.
- Denied actions produce useful refusals instead of silent drops.
- Evidence records connect Shrimpy action outcomes to external transaction or settlement ids.
- A `shrimpychain` integration can be built as an optional package or plugin that owns wallet truth, pricing, debt, and settlement.
