# PufferLib And Personal RL For Shrimpy

Date: 2026-06-09
Status: Research / Eventually

Question: what can PufferPPO / PufferLib enable for the larger Shrimpy goal of a personal RL framework that can fine-tune models so they naturally know a user's environment, tools, projects, and habits?

Short answer: PufferLib is most useful to Shrimpy as a model for fast, inspectable environment design and as a possible trainer for small discrete policies. It should not be treated as a direct "fine-tune my LLM" drop-in. The near-term Shrimpy move is to build the private environment/eval/trajectory layer that any trainer could consume later. PufferLib becomes relevant when Shrimpy can express user work as replayable environments with compact observations, explicit actions, rewards, and rollback gates.

Upstream naming note: the user-facing phrase "PufferPPO" maps best to current PufferLib 4.0's `PuffeRL` / `pufferlib.pufferl` stack. The current docs describe the algorithm as a PPO variant with Puffer-specific changes rather than as a plain PPO implementation.

Related note: [rl-eval-framework.md](rl-eval-framework.md) covers the broader personal eval/training landscape. This note narrows in on what PufferLib changes about the design.

## Current Read

[PufferLib](https://github.com/PufferAI/PufferLib) is a fast RL library with a native CUDA/C backend, a fallback PyTorch backend, first-party C environments under Ocean, a `puffer train|eval|sweep` CLI, Constellation experiment visualization, and Protein hyperparameter/reward tuning. The [current docs](https://puffer.ai/docs.html) emphasize 4.0, CUDA setup, the CLI workflow, Ocean environments, static memory, CUDA graph tracing, vectorized rollout buffers, a PPO-variant algorithm, PufferNet, and sweeps as the fundamental unit of compute. The [2024 paper](https://arxiv.org/abs/2406.12905) frames PufferLib around environment compatibility and fast vectorization. The [2025 RLJ paper](https://rlj.cs.umass.edu/2025/papers/RLJ_RLC_2025_151.pdf) reports 1M+ steps/second first-party environments and a PPO demo training Ocean environments at hundreds of thousands to over a million steps/second on an RTX 4090.

That matters because personal agent training will bottleneck on environment quality before it bottlenecks on optimizer cleverness. If Shrimpy cannot reset a task, replay a trajectory, score the result, compare a candidate policy, and keep private data local, then adding a trainer only creates expensive noise.

For Shrimpy, PufferLib suggests a sharper product thesis:

- Shrimpy should become the user's private RL environment factory before it becomes a trainer.
- Sessions, tools, channels, workspace diffs, user corrections, test results, and command outcomes are the raw trajectory stream.
- Personal evals should be first-class and CLI-addressable.
- Training should be downstream of eval capture, and candidates should never become defaults without regression checks.
- PufferLib itself is most plausible for small policy layers and simulated Shrimpy task games, not direct full-text LLM policy optimization.

## What This Can Enable

### 1. A Shrimpy Gym For Personal Work

Shrimpy can define small environments around real workflows:

- Skill selection: given a task and available skills, choose whether to load a skill and which one.
- Context packing: decide which files, notes, memories, and session fragments should enter a prompt.
- Tool policy: decide when to read, search, run tests, ask the user, spawn a worker, or stop.
- Channel routing: decide which surface or agent should receive a message.
- Research capture: decide what should become a vault note, backlog item, research note, or transient session log.
- Coding delegation: decide whether a task should stay local, use a worker session, or split into inspectable subtasks.

These are not base-model language generation tasks. They are compact decision problems around Shrimpy's runtime. That makes them a better fit for PufferLib-style RL than "train the whole assistant to write all text differently."

### 2. Fast Synthetic Rehearsal Before Real-World Promotion

PufferLib's core lesson is that high-quality RL needs many cheap environment steps. A real user's workspace is too slow and too risky to use as the inner loop. Shrimpy should instead create sandboxed, replayable task worlds:

- frozen workspace snapshots
- synthetic channel transcripts
- recorded tool outputs
- scripted user corrections
- deterministic tests and validators
- reward functions based on outcome, cost, latency, and user-preference match

Policies train in the synthetic/sandbox loop, then face live-like regression evals before use. This preserves the local-first thesis while avoiding live workspace damage.

### 3. Reward And Hyperparameter Sweeps

PufferLib treats sweeps as a first-class unit of compute. That maps well to Shrimpy because the uncertain part is often not "which neural architecture?" but "which reward shape actually captures the user's taste without overfitting?"

Useful sweep targets:

- reward weights for task success, latency, cost, diff size, test passing, and user correction penalties
- context budgets and retrieval thresholds
- tool-use penalties
- ask-vs-act thresholds
- worker delegation thresholds
- prompt/router policy variants

Protein-like tuning is especially relevant because Shrimpy's user-facing goal is not max benchmark score at any cost. It is the Pareto frontier of quality, privacy, latency, cost, and user annoyance.

### 4. Personal Adapters With Better Gates

PufferLib does not remove the need for LLM fine-tuning frameworks such as ART, TRL, Unsloth, OpenClaw-RL, or future OpenEnv-compatible trainers. It can still improve the loop by making the environment/reward layer sharper.

Candidate flow:

```text
Shrimpy sessions and tool outcomes
  -> private trajectory ledger
  -> replayable personal eval environments
  -> reward/preference datasets
  -> external trainer for LoRA, adapter, router, or small policy
  -> A/B eval against current behavior
  -> gated promotion or rollback
```

The important user-visible promise is not "Shrimpy trains constantly." It is "Shrimpy learns only from inspectable private evidence, proves the candidate behaves better, and can roll back."

## Architecture Shape

The PufferLib-inspired Shrimpy architecture should separate five layers:

1. Capture: record sessions, tool calls, channel events, command results, file diffs, user corrections, ratings, and final outcomes into a private trajectory ledger.
2. Environment: expose reset/step/reward/replay boundaries for selected workflows. Keep each environment small, deterministic where possible, and runnable from a CLI.
3. Policy targets: start with small decision policies such as tool routing, context packing, skill choice, and delegation. Treat full LLM adapter training as a later downstream target.
4. Trainer adapters: export tasksets or trajectories to whichever trainer fits the target. PufferLib is plausible for small discrete policies; ART/TRL/Unsloth/OpenClaw-style stacks are more plausible for LLM adapters.
5. Gatekeeper: run regression evals, compare candidate behavior, store provenance, and promote only when the user or an explicit policy allows it.

Possible Shrimpy CLI surface:

```bash
shrimpy trajectories list
shrimpy trajectories export --agent main --format jsonl
shrimpy eval run skill-selection
shrimpy eval replay <trajectory-id>
shrimpy eval serve --protocol openenv
shrimpy train export skill-selection --format pufferlib
shrimpy train candidate list
shrimpy train candidate promote <id>
```

Every command should be inspectable and non-destructive by default. Anything that touches live model defaults, user workspace state, or long-lived preference memory needs explicit promotion.

## Where PufferLib Fits Best

PufferLib is a strong candidate for:

- training small policies over compact observations and discrete actions
- fast simulated task games inspired by Shrimpy workflows
- multi-agent coordination experiments for channel routing or worker delegation
- hyperparameter and reward sweeps
- experiment dashboards and training-loop ergonomics
- a design reference for keeping environments simple enough to run fast

PufferLib is a weak direct fit for:

- end-to-end LLM text generation RL
- raw personal workspace rollouts
- TypeScript-native integration without a Python/CUDA bridge
- CPU-only personal laptops when high throughput is required
- tasks whose rewards depend mostly on fuzzy long-horizon human taste

The practical stance is to make Shrimpy export environments and trajectories first. PufferLib can be one backend, not the framework's identity.

## First Prototype Ideas

### Skill Selection Environment

Observation: task text embedding or compact features, available skills, recent agent context, and whether the task matches known skill trigger rules.

Action: no skill, one skill, or a small ordered skill set.

Reward: positive for matching an oracle or accepted final behavior, negative for loading irrelevant skills, missing required skills, bloating context, or causing a failed task.

Why first: Shrimpy already treats skills as prompt/resource bundles, and skill choice is discrete enough for a small policy.

### Context Packing Environment

Observation: task, candidate files/notes/session fragments, size budget, recency, source type, and prior outcome labels.

Action: include/exclude/rank context chunks.

Reward: positive for successful task completion under budget, negative for missing required evidence, leaking irrelevant private context, or causing repeated user corrections.

Why first: context choice is central to "naturally knows my environment" but can improve without modifying the base LLM.

### Delegation Policy Environment

Observation: task shape, file count, uncertainty, test availability, expected blast radius, and current worker availability.

Action: keep local, spawn explorer, spawn worker, split into N workers, or ask the user.

Reward: quality, elapsed time, merge friction, number of follow-up corrections, and whether verification passed.

Why first: it aligns with Shrimpy's coding-agent direction and produces observable outcomes.

## Risks

- Reward hacking: a policy may optimize measurable proxies such as fewer asks or smaller diffs while making worse choices.
- Privacy leakage: trajectory exports must stay local by default and label sensitive payloads before any external trainer path.
- Workspace harm: live workspace rollouts are unsafe unless fully sandboxed and reversible.
- Trainer lock-in: choosing PufferLib too early could force Shrimpy's environment model around C/CUDA assumptions.
- Misplaced training target: many personal preferences are better handled by memory, prompts, SFT, DPO, or eval gates than by online RL.
- False personalization: a model that overfits local quirks can become less generally capable or less honest about uncertainty.

## Near-Term Direction

Do not add PufferLib as a Shrimpy dependency yet. Add the primitives that would make PufferLib or any other trainer useful:

1. Private trajectory ledger with event provenance.
2. CLI replay for selected completed sessions.
3. Small personal eval/taskset format.
4. Deterministic rewards for tool success, test results, validation, file diffs, and user corrections.
5. Candidate policy registry with explicit promotion/rollback.
6. Export adapters, starting with plain JSONL and only later PufferLib/OpenEnv/ART/TRL-specific formats.

This keeps the Shrimpy core shrimple: capture, evaluate, replay, export, gate. The trainer can change.

## Sources Checked

- [PufferLib GitHub repository](https://github.com/PufferAI/PufferLib)
- [PufferLib docs](https://puffer.ai/docs.html)
- [PufferLib release page](https://github.com/PufferAI/PufferLib/releases)
- [PufferLib: Making Reinforcement Learning Libraries and Environments Play Nice](https://arxiv.org/abs/2406.12905)
- [PufferLib 2.0: Reinforcement Learning at 1M steps/s](https://rlj.cs.umass.edu/2025/papers/RLJ_RLC_2025_151.pdf)
