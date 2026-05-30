# Shrimpy RL Eval Framework Watchlist

Date: 2026-05-20
Status: Research / Eventually

Question: if local AI is moving toward personal models that improve from private interaction streams, what should Shrimpy build, defer, or watch before committing to an RL/eval stack?

Short answer: the thesis is directionally right, but it is too early for Shrimpy to adopt a full RL training stack. The durable thing to build first is the eval/environment layer: private trajectory capture, personal tasksets, replayable reward signals, regression evals, and exports into whichever RL trainer wins later.

The public stack is still fragmented. The closest path today looks like:

```text
Shrimpy sessions + tool outcomes
  -> private trajectory and feedback ledger
  -> personal eval environments / tasksets
  -> deterministic rewards first, LLM judges second
  -> adapter training in OpenClaw-RL, ART, TRL, Unsloth, Tinker, or similar
  -> A/B eval and rollback before any adapter becomes the default
```

This should stay in "watch and design for later" mode until the ecosystem has clearer standards around environment definitions, reward/rubric portability, local training ergonomics, and safe rollback.

---

## Current Read

The missing product layer is not "one more trainer." It is the private personal loop around the trainer:

1. Capture the user's real interaction stream locally.
2. Convert corrections, re-asks, edits, tool outcomes, command results, explicit ratings, and task completion signals into preference or reward data.
3. Maintain evals and regression tests for "does this model behave the way the user wants?"
4. Train a small LoRA or adapter on a scheduled cadence.
5. A/B the candidate adapter against the current adapter.
6. Roll back automatically when general quality, safety, tool reliability, or personal preference adherence regresses.
7. Export the winning adapter to local runtimes.

OpenClaw-RL is closest to this complete personal loop. ART is probably the most practical "drop RL into an existing agent app" project. Verifiers, OpenEnv, and NeMo Gym are strategically important because they are about environments and evals, not just training. Unsloth is the strongest local/consumer training surface. Tinker is a useful cloud training API if the privacy trade-off is acceptable.

For Shrimpy, the highest-leverage near-term move is not RL. It is eval capture and replay. A good Shrimpy eval suite would be valuable even if the eventual trainer is ART, TRL, OpenClaw-RL, Unsloth, Tinker, or something that does not exist yet.

Related musing: [Agent Currency And Personal RL](../musings/agent-currency-and-rl.md) sharpens this into a cost/value ledger idea. The ledger could improve runtime policy first, then become reward or preference data later.

---

## Why This Fits Shrimpy

Shrimpy already has the hard local-first substrate that personal RL needs:

- Sessions carry instructions and can produce trajectories.
- Channels are append-only routing/log surfaces.
- Tool calls and command outputs are natural outcome signals.
- Workspace files are inspectable and private by default.
- Agent memory, soul, and system docs already separate durable preference/state from ephemeral session behavior.
- The CLI-first rule means eval capture, replay, and export can be agent-friendly commands rather than a hidden service.

The interesting question is whether Shrimpy should become a trainer. The likely answer is no, or at least not soon. Shrimpy should be the private capture/eval/control plane and let specialized trainers own GPU orchestration, LoRA updates, optimizer details, rollout scaling, and model export.

---

## Caveat: RL Is Not Always The Right Hammer

For "personal defaults" specifically, SFT or DPO may beat full RL for many behaviors:

- Tone and formatting
- Preferred answer structure
- Recurring project conventions
- Naming taste
- How much context to include
- How direct or speculative the agent should be

RL is more compelling when there is a reliable outcome signal:

- Tests pass or fail.
- A tool call succeeds or errors.
- Structured output validates or does not.
- A browser task reaches the expected state.
- A user re-asks because the prior answer missed.
- The user edits the final artifact in a way that can be diffed.
- A judge rubric can reliably rank multiple trajectories.

So Shrimpy should treat "personal evals" as the center. Some evals will later become reward functions; many should remain regression checks.

---

## Landscape

### OpenClaw-RL

[OpenClaw-RL](https://github.com/Gen-Verse/OpenClaw-RL) is the closest match to the personal-agent end-state. It wraps a self-hosted model behind an OpenAI-compatible API, collects live multi-turn interactions, keeps serving while background RL loops run, and frames next user/tool/environment feedback as the training signal. It also supports LoRA and cloud/local deployment paths.

Why it matters to Shrimpy:

- It validates the idea that normal conversations can become training trajectories.
- It treats privacy/self-hosting as central rather than incidental.
- It has a similar "personal agent improves while you use it" shape.
- Its OpenAI-compatible serving boundary could fit Shrimpy's model-provider layer.

Concerns:

- Default examples still imply serious GPU infrastructure.
- It is tied to OpenClaw assumptions and a fast-moving training stack.
- It proves the loop more than it proves a stable product interface.

Watch for:

- Smaller single-user recipes.
- Clean trajectory export/import formats.
- Clearer rollback and regression eval stories.
- Whether its environment abstractions converge with Verifiers/OpenEnv/NeMo Gym or stay bespoke.

### OpenPipe ART

[ART / Agent Reinforcement Trainer](https://github.com/openpipe/art) is the most practical app-builder toolkit. The docs position it as an open-source framework for training multi-turn agents with GRPO, with a client that can live in an existing Python app and a backend that can run on local or cloud GPUs.

Why it matters to Shrimpy:

- It is designed to add RL to an existing application rather than require a whole new agent runtime.
- The task/env/reward mental model maps cleanly onto Shrimpy sessions and tool outcomes.
- It has integrations and defaults that reduce the DevOps burden.
- [RULER](https://wandb.ai/site/ruler/) is strategically interesting because it ranks groups of trajectories with an LLM judge, reducing hand-written reward engineering.

Concerns:

- It is Python-first while Shrimpy is TypeScript.
- Serverless/cloud paths are convenient but not automatically compatible with a private local-agent thesis.
- LLM-judge rewards need strong auditability before feeding personal behavior changes.

Watch for:

- Stable environment APIs.
- Local-only workflows.
- Better TypeScript or protocol-level integration points.
- Whether RULER-style relative judging becomes a portable reward primitive.

### Verifiers

[Prime Intellect Verifiers](https://github.com/PrimeIntellect-ai/verifiers) may be the most strategically relevant project. It defines environments for training and evaluating LLMs as the combination of dataset, harness, and reward/rubric.

Why it matters to Shrimpy:

- It models exactly the layer Shrimpy should care about first: reproducible tasks plus scoring.
- The same environment can support evals, training, synthetic data, and harness experiments.
- Its taskset/harness API direction maps well to "personal evals."

Concerns:

- It is moving quickly.
- It is still more research/dev oriented than consumer-personal.
- Adopting it directly may pull Shrimpy into Python and external environment server assumptions too early.

Watch for:

- The Taskset/Harness API stabilizing.
- Easy local environment authoring.
- Interop with OpenEnv, NeMo Gym, ART, and TRL.
- Whether personal/private eval suites become first-class use cases.

### OpenEnv

[OpenEnv](https://huggingface.co/docs/trl/main/en/openenv) is a standardization play for RL and agentic environments. Hugging Face TRL already documents OpenEnv integration, and NeMo Gym references it in its environment-library ecosystem.

Why it matters to Shrimpy:

- It may become the portable "environment protocol" that lets Shrimpy export tasks without choosing a trainer.
- The backend-server model could fit Shrimpy eval environments if Shrimpy exposes a local reset/step boundary.

Concerns:

- It is still early as a practical standard.
- Shrimpy should not contort its own workspace/session model until adoption is clearer.

Watch for:

- Adoption by ART, Verifiers, NeMo Gym, TRL, and local trainers.
- Whether the protocol handles long-running tool use, file systems, and personal state cleanly.

### NeMo Gym

[NVIDIA NeMo Gym](https://github.com/NVIDIA-NeMo/Gym) is a broad environment/eval catalog and scaling layer. It defines environments as tasks, agent harnesses, verifiers, and state, and emphasizes stateful evals, tool calling, sandboxes, and transition from eval to training.

Why it matters to Shrimpy:

- Its primitives are close to what Shrimpy needs for tool-heavy agent evals.
- Its catalog can serve as a reference for how to define realistic environment tasks.

Concerns:

- It is likely too infrastructure-heavy to adopt wholesale.
- NVIDIA ecosystem gravity may not match Shrimpy's local-first Pi-style shape.

Watch for:

- Which environment schemas become portable.
- How it composes with Verifiers and OpenEnv.
- Whether small local eval harnesses can reuse its task definitions without importing the whole stack.

### Nous Atropos

[Atropos](https://github.com/nousresearch/atropos) is an environment microservice framework for async LLM RL. It focuses on collecting and evaluating trajectories across dataset, online, RLAIF/RLHF, multi-turn, code, and multimodal environments.

Why it matters to Shrimpy:

- The "environment as service" shape could fit a future `shrimpy eval serve` command.
- It separates environments from trainers.
- It integrates with Axolotl and Tinker, which makes it a useful bridge.

Concerns:

- It is research-workflow oriented.
- Microservice infrastructure may be heavier than needed for personal evals.

Watch for:

- Whether its scored trajectory API becomes broadly reused.
- Whether it supports simple local personal eval loops without cluster assumptions.

### Unsloth

[Unsloth](https://unsloth.ai/docs) is the strongest local/consumer training surface. It positions itself around local model running and training, supports many model families, includes RL/GRPO paths, and now has a no-code Studio surface.

Why it matters to Shrimpy:

- It may be the easiest eventual way for a user to train small local adapters.
- Its GGUF/LoRA/export workflows are close to local runtime needs.
- A visual local trainer could pair well with a Shrimpy-generated eval/trajectory export.

Concerns:

- It is not a personal RL suite by itself.
- The training UX may abstract away too much unless exports and run metadata remain inspectable.

Watch for:

- Low-VRAM GRPO stability.
- Adapter export into common local runtimes.
- Headless CLI workflows that can consume Shrimpy-produced datasets.

### Tinker

[Thinking Machines Tinker](https://thinkingmachines.ai/tinker/) is a cloud training API that exposes a small training interface while hiding distributed infrastructure. It uses LoRA and asks users to bring datasets or RL environments.

Why it matters to Shrimpy:

- It may be the fastest way to experiment with adapter training without owning GPU infrastructure.
- It is explicitly compatible with "bring your own RL environments."

Concerns:

- It is cloud training, so it conflicts with the strictest version of the local/private thesis.
- Personal interaction data may be too sensitive to send out unless heavily filtered.

Watch for:

- Data handling guarantees.
- Downloadable adapter/checkpoint workflows.
- Whether local Tinker-compatible backends, such as SkyRL's Tinker API integration, become practical.

### Training Engines

The rest of the trainer landscape matters, but Shrimpy should treat these as backends rather than architectural centers:

- [TRL](https://huggingface.co/docs/trl/index): the default research/dev library for SFT, DPO, GRPO, reward modeling, PPO, RLOO, OpenEnv, Unsloth, and vLLM integrations.
- [verl](https://github.com/verl-project/verl): serious large-scale RL post-training stack with production-oriented dataflow and inference/training integration.
- [OpenRLHF](https://github.com/OpenRLHF/OpenRLHF): Ray/vLLM/DeepSpeed RLHF stack with single-turn and multi-turn agent modes.
- [SkyRL](https://docs.skyrl.ai/docs): modular full-stack LLM RL library with environment, async training, tool-use, and Tinker API support.
- [slime](https://github.com/THUDM/slime): RL scaling/post-training framework around Megatron and SGLang.
- [Axolotl GRPO](https://docs.axolotl.ai/docs/grpo.html): pragmatic config-driven bridge for GRPO with vLLM serving, LoRA sync, custom rewards, async generation, replay buffers, and scaling knobs.

None of these should drive Shrimpy's near-term architecture. They are useful export targets once Shrimpy has evals and trajectories worth training on.

---

## Shrimpy Shape If Built

The first useful version should be an eval framework, not a trainer.

### 1. Capture

Store eval-ready trajectory records for selected sessions:

- User prompt
- System/session instructions hash
- Model/provider identity
- Assistant response
- Tool calls and outputs
- File diffs when applicable
- Command exit codes and test results
- User correction/re-ask/edit signal
- Final accepted artifact or task outcome

This should be opt-in and local. Personal data capture must be explicit, inspectable, redaction-friendly, and easy to delete.

### 2. Normalize Signals

Turn raw interaction events into typed signals:

- `explicit_rating`: user thumbs up/down or score
- `correction`: user states what was wrong
- `retry`: user asks again or redirects
- `edit_delta`: user edits generated artifact
- `tool_success`: tool returns expected state
- `tool_failure`: tool errors or returns invalid state
- `test_result`: pass/fail plus log excerpt
- `schema_validity`: structured output validates
- `task_completion`: task marked done, abandoned, or reverted

Avoid pretending weak signals are stronger than they are. A re-ask is not automatically a negative reward; it is evidence that needs interpretation.

### 3. Personal Tasksets

Represent recurring Shrimpy work as tasksets:

- "Follow this repo's coding style."
- "Give compact but complete status updates."
- "Use CLI-first surfaces."
- "Respect local-first privacy boundaries."
- "Handle tool failures without losing the thread."
- "Summarize channel history without inventing."
- "Produce valid structured outputs for config/state files."

Each taskset needs cases, fixtures, and scorers. Some scorers can be deterministic. Others need a judge rubric.

### 4. Reward And Rubric Library

Prefer deterministic rewards where possible:

- Test pass/fail
- Typecheck/lint pass/fail
- JSON schema validation
- CLI exit code
- Exact file existence/content checks
- Snapshot diffs

Use judge models only when deterministic scoring is inadequate:

- Tone preference
- Helpfulness under ambiguity
- Whether the agent respected a privacy boundary
- Whether a code review found the important bug
- Whether a summary captured the right operational state

Every judge prompt should be versioned and replayable. Judge outputs should be stored as evidence, not silently treated as ground truth.

### 5. Replayable Environments

Eventually expose Shrimpy tasks through a local environment boundary:

```text
reset(task_id) -> observation
step(action) -> observation, reward, done, metadata
```

For coding/session tasks, the action may be "assistant message plus tool calls" rather than a single token action. The important part is reproducible setup, bounded tool access, and inspectable scoring.

### 6. Export

Export captured data and evals without committing to a trainer:

- JSONL trajectory exports for SFT/DPO.
- Preference pairs from accepted vs rejected attempts.
- Environment/taskset exports for Verifiers/OpenEnv-style harnesses.
- ART-compatible task/env/reward wrappers if ART becomes the practical path.
- Unsloth/Axolotl-ready datasets for local fine-tuning experiments.

### 7. A/B And Rollback

No trained adapter should become default until it passes:

- Personal evals
- General regression evals
- Tool-use evals
- Privacy/safety evals
- A/B comparison against the current adapter

Adapters need metadata:

- Base model
- Training data snapshot
- Eval run IDs
- Reward/rubric versions
- Known regressions
- Rollback pointer

---

## CLI Sketch

If this becomes real, expose it through Shrimpy commands first:

```bash
shrimpy eval list
shrimpy eval run personal-defaults --model qwen-local
shrimpy eval capture --session <id>
shrimpy eval signals --since 7d
shrimpy eval export personal-defaults --format verifiers
shrimpy eval export personal-defaults --format openenv
shrimpy eval export personal-defaults --format art
shrimpy adapter compare current candidate --eval personal-defaults
shrimpy adapter promote candidate --if-evals-pass
shrimpy adapter rollback
```

These are not implementation commitments. They are a reminder that the feature should be inspectable and automatable before it has a UI.

---

## Suggested File Layout

Possible future workspace shape:

```text
workspace/
  evals/
    personal-defaults/
      taskset.json
      cases.jsonl
      scorers/
        structured-output.ts
        tests-pass.ts
      judge-prompts/
        tone.md
        privacy.md
      runs/
        2026-05-20T120000Z.jsonl
  training/
    trajectories/
      sessions-2026-05.jsonl
    preferences/
      accepted-rejected-2026-05.jsonl
    adapters/
      qwen3-4b-personal-2026-05-20/
        adapter.json
        eval-summary.json
```

The key point is legibility. Training artifacts should be as inspectable as Shrimpy memory and channel logs.

---

## Adoption Triggers

Revisit this when at least two of these are true:

- Verifiers/OpenEnv/NeMo Gym converge on an environment/taskset shape that can be exported without throwing away Shrimpy concepts.
- ART or a similar toolkit has a stable local-only path and a clean way to integrate non-Python apps.
- Unsloth or Axolotl makes low-VRAM GRPO/SFT/DPO from Shrimpy exports boring and reliable.
- OpenClaw-RL demonstrates a single-user personal loop with clear rollback, privacy, and regression eval practices.
- A local runtime can hot-swap and roll back LoRA adapters safely.
- Shrimpy has enough captured eval cases to detect regressions with confidence.

Until then, build small pieces that are valuable without RL:

- A session/eval trajectory exporter.
- A deterministic eval runner for Shrimpy tasks.
- A personal preference regression suite.
- A judge-rubric runner with stored evidence.

---

## Risks

- **Reward hacking:** agents learn to satisfy weak proxies rather than user intent.
- **Privacy leakage:** personal interaction streams become training data accidentally copied into cloud tools.
- **Overfitting:** the adapter gets better at narrow preferences and worse at general reasoning.
- **Opaque memory drift:** training changes behavior in ways that are harder to inspect than `MEMORY.md`.
- **Bad judge incentives:** LLM judges reward style or verbosity rather than actual task success.
- **Credit assignment:** multi-agent/channel workflows make it hard to know which action caused success or failure.
- **Data contamination:** eval cases leak into training and make regression numbers meaningless.
- **Operational weight:** trainer orchestration could swamp Shrimpy's clean local-agent shape.

The mitigation is to keep eval data, training data, reward prompts, and adapter metadata separate and inspectable.

---

## Working Position

Do not build or adopt a full RL stack yet.

Do build toward an eval-ready Shrimpy:

- Capture trajectories locally.
- Normalize outcome signals.
- Maintain personal tasksets.
- Prefer deterministic scoring.
- Version judge prompts.
- Export to external trainers.
- Require A/B and rollback before promotion.

If personal local AI is the future, Shrimpy's durable advantage is not owning the optimizer. It is owning the private, legible, user-specific environment in which better models can prove they are actually better.

---

## Sources

Landscape checked against public project docs/repos on 2026-05-20.

- [OpenClaw-RL](https://github.com/Gen-Verse/OpenClaw-RL)
- [OpenPipe ART](https://github.com/openpipe/art) and [ART docs](https://art.openpipe.ai/getting-started/about)
- [W&B RULER](https://wandb.ai/site/ruler/)
- [Prime Intellect Verifiers](https://github.com/PrimeIntellect-ai/verifiers)
- [Prime-RL](https://github.com/PrimeIntellect-ai/prime-rl)
- [OpenEnv integration in TRL](https://huggingface.co/docs/trl/main/en/openenv)
- [NVIDIA NeMo Gym](https://github.com/NVIDIA-NeMo/Gym)
- [Nous Atropos](https://github.com/nousresearch/atropos)
- [Unsloth docs](https://unsloth.ai/docs)
- [Thinking Machines Tinker](https://thinkingmachines.ai/tinker/)
- [TRL](https://huggingface.co/docs/trl/index)
- [verl](https://github.com/verl-project/verl)
- [OpenRLHF](https://github.com/OpenRLHF/OpenRLHF)
- [SkyRL](https://docs.skyrl.ai/docs)
- [THUDM slime](https://github.com/THUDM/slime)
- [Axolotl GRPO](https://docs.axolotl.ai/docs/grpo.html)
