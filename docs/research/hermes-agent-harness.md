# Hermes Agent Harness Survey

Date: 2026-08-01
Status: Research
Hermes source: local checkout of `nousresearch/hermes-agent`, `main` aligned with the local `origin/main` tracking ref
Hermes commit: `50d4d25ca2245c806babbb10a05f758245a0e393`
Commit subject: `fix(tests): stub the auth function doctor actually calls + restore dropped parametrize cases`

## Executive Read

Hermes Agent's normal runtime is a large, custom Python agent harness. It does not currently build its main model/tool loop on LangGraph, LangChain, the OpenAI Agents SDK, PydanticAI, CrewAI, AutoGen, or another general-purpose agent framework. It uses provider SDKs and protocols as inference transports, but owns conversation state, tool dispatch, retries, streaming, context management, persistence, subagents, verification, and turn lifecycle itself.

The claim that Hermes is "just a Python REPL" mixes up three different things:

- Hermes calls its classic `prompt_toolkit` chat interface a REPL. That is the interactive input shell around the agent, not the agent runtime.
- Hermes exposes an `execute_code` tool that runs a model-written Python script in a child process. The script can call a seven-tool subset through generated RPC stubs, so it is a small programmatic tool-calling environment inside one normal harness iteration.
- The actual agent is an ordinary tool-calling loop: send messages and schemas to a model, normalize its response, execute requested tools, append tool results, and call the model again until it returns text or a stop condition fires.

The historical answer needs one qualification. Hermes did use `mini-swe-agent` as the implementation behind some terminal execution environments from January to March 2026, and it carried a separate Mini-SWE trajectory runner for RL work. That dependency did not own Hermes' main `AIAgent` conversation loop. Hermes removed the submodule and inlined the terminal backends in March 2026, then removed the remaining Mini-SWE references. The present core is self-hosted.

## The Core Harness

`run_agent.py` still defines the public `AIAgent` façade, but most substantial behavior has been extracted into focused `agent/` modules. The current turn path is approximately:

```text
CLI, gateway, library, cron, or subagent
                  |
                  v
       AIAgent.run_conversation()
                  |
                  v
       build_turn_context()
  prompt + history + memory + persistence
                  |
                  v
       conversation_loop.run_conversation()
                  |
       +----------+-----------+
       |                      |
       v                      v
 provider transport      context/retry policy
       |                      |
       +----------+-----------+
                  v
        normalized response
          |              |
   tool calls          final text
          |              |
          v              v
  tool executor      turn finalizer
          |
          +---- append results and loop
```

The important seams are:

- `run_agent.py`: public `AIAgent` façade and compatibility surface. Construction forwards to `agent/agent_init.py`; conversation execution forwards to `agent/conversation_loop.py`.
- `agent/turn_context.py`: once-per-turn setup, including prompt restoration/building, input sanitation, preflight compression, external-memory prefetch, and crash-resilient persistence.
- `agent/conversation_loop.py`: the main bounded model/tool loop. It owns request construction, streaming/non-streaming calls, retries, fallback activation, response validation, tool-call repair, continuation behavior, context-pressure handling, verification nudges, and the decision to loop or stop.
- `agent/transports/`: provider protocol adapters. Hermes keeps an OpenAI-shaped internal transcript and normalizes Chat Completions, Anthropic Messages, Bedrock Converse, and Codex Responses into shared `NormalizedResponse` and `ToolCall` types.
- `model_tools.py`: tool definition assembly and the central named-tool dispatcher.
- `agent/tool_executor.py`: sequential, concurrent, and dependency-aware segmented tool execution, plus result insertion and lifecycle callbacks.
- `agent/turn_finalizer.py`: post-loop persistence, usage/lifecycle notification, memory sync, cleanup, and result assembly.

The loop is bounded by both `max_iterations` and an `IterationBudget`; the normal `AIAgent` default is 90 model/tool iterations. A turn can consume additional bounded continuations for provider recovery, truncated output, verification, context compression, malformed tool calls, and similar cases. This is much more policy than a minimal function-calling sample, even though the irreducible center remains the familiar `model -> tool calls -> tool results -> model` loop.

Hermes' provider layer is transport code, not a borrowed agent harness. The default dependencies include the OpenAI SDK and supporting HTTP/config/UI libraries. Native Anthropic and other provider packages are optional. Hermes formerly depended on LiteLLM indirectly around the Mini-SWE integration, but removed LiteLLM in March 2026; the current project metadata contains no general-purpose agent-framework dependency.

## What the Python Execution Tool Actually Does

`tools/code_execution_tool.py` calls the feature **Programmatic Tool Calling**. It is best understood as an optimization available to the main agent, not as the main agent itself.

For a local POSIX run:

1. The model calls `execute_code` with a Python script.
2. Hermes writes that script and a generated `hermes_tools.py` module into a temporary staging directory.
3. Hermes starts an RPC listener and launches the script in a child Python process.
4. Calls such as `web_search(...)` or `read_file(...)` travel back to the parent, which routes them through the normal Hermes tool dispatcher.
5. Only the script's stdout is returned as the `execute_code` tool result; intermediate RPC results stay out of the model context.

Windows local execution uses loopback TCP because Hermes treats Unix-domain sockets there as unreliable. Remote terminal backends use file-based request/response RPC. The available in-script tools are limited to `web_search`, `web_extract`, `read_file`, `write_file`, `search_files`, `patch`, and foreground `terminal`. Recursive `execute_code`, delegation, arbitrary MCP tools, and the broader Hermes tool registry are unavailable. The child also gets environment scrubbing, a tool-call cap, output caps, a timeout, and process cleanup.

This resembles a disposable Python execution cell more than a persistent REPL. The model does not live inside the interpreter, the interpreter does not drive the outer reasoning loop, and normal model turns do not require `execute_code`. Its architectural value is that the model can express loops, branching, filtering, and many tool calls in one inference round while returning only a compact result.

## Origin and External Components

The repository history supports the "custom harness" reading, not just the current dependency list. Hermes' initial commit, `21d80ca68346dfdb8d3556015a723a9217f8566f` from 2025-07-22, already contained `AIAgent.run_conversation()` as a direct OpenAI-compatible function-calling loop. That first version created an `OpenAI` client, submitted messages and tool schemas, called a local `handle_function_call`, appended role=`tool` results, and repeated until final text or a ten-iteration cap. The current runtime is an extensive evolution of that code path.

Later external integrations should not be mistaken for its origin:

- `mini-swe-agent` was added as a submodule on 2026-01-23 for terminal execution backends. A separate `mini_swe_runner.py` also used Mini-SWE environments while producing Hermes trajectory data. Commit `02b38b93cba9237da77619db5ea9db481648a4b9` removed the dependency and inlined the Docker/Modal backends on 2026-03-24; commit `ad1bf16f2808fa95f0e8253f3311f6c63e9d5b79` removed the remaining references the same day.
- Tinker/Atropos was a separate RL training and evaluation integration, not the production chat harness. Hermes removed that submodule and its `environments/` integration in May 2026.
- `nemo-relay` is a first-party lifecycle and shared-metrics component. It observes and coordinates calls; it is not the reasoning/tool loop.
- `codex_app_server` is a genuine optional exception to the self-hosted loop. When selected, `conversation_loop.py` hands the turn to a Codex app-server subprocess and bypasses Hermes' normal tool dispatch for that turn. This is an alternate opt-in runtime, not the foundation of default Hermes sessions.

## Architectural Character

Hermes is therefore less "a REPL agent" than a vertically integrated Python agent platform. It shares a single homegrown harness across the CLI, TUI, gateway, cron, library embedding, and delegated children, with adapters at the edges and a very large amount of recovery policy in the middle.

The strength of this design is control. Hermes can normalize many provider quirks, preserve exact session semantics across messaging surfaces, stream intermediate state, run tools concurrently, steer or interrupt live turns, apply verification loops, and coordinate memory and compression without waiting for an upstream framework.

The cost is visible in the code shape. At the inspected commit, `run_agent.py` is about 7,500 lines and `agent/conversation_loop.py` about 7,100 lines even after extraction work. Initialization, tool execution, and the classic CLI are also large. Many mature behaviors are encoded as special-case recovery branches inside the central turn path. Hermes is from scratch in the meaningful dependency sense, but it is no longer small or conceptually equivalent to a short REPL loop.

## Shrimpy Takeaways

Hermes does not provide an obvious harness dependency for Shrimpy to adopt. The relevant lessons are design patterns:

- Keep one canonical internal message/tool-call shape and put provider differences behind transports.
- Treat programmatic tool calling as an optional context-reduction tool. A child script that can call a narrow typed tool subset is useful, but it should not be confused with the outer session runtime.
- Keep interfaces such as CLI, chat adapters, cron, and subagents above the same turn boundary.
- Make interruption, persistence, context compaction, memory hooks, and tool lifecycle first-class seams before recovery cases accumulate in the central loop.
- Preserve Pi as Shrimpy's default harness boundary unless a concrete limitation warrants replacing a specific seam. Hermes shows the long-term maintenance burden of owning the full loop directly.

## Source Map

Current source inspected:

- `run_agent.py`
- `agent/agent_init.py`
- `agent/turn_context.py`
- `agent/conversation_loop.py`
- `agent/transports/base.py`
- `agent/transports/types.py`
- `agent/tool_executor.py`
- `agent/turn_finalizer.py`
- `agent/codex_runtime.py`
- `model_tools.py`
- `tools/code_execution_tool.py`
- `pyproject.toml`
- `website/docs/user-guide/features/code-execution.md`
- `website/docs/reference/cli-commands.md`

History inspected:

- Initial harness commit `21d80ca68346dfdb8d3556015a723a9217f8566f`
- Mini-SWE terminal-backend addition `ba19d530ad2418f8a787c88fc7553ca186b9ae52`
- Mini-SWE dependency removal `02b38b93cba9237da77619db5ea9db481648a4b9`
- Remaining Mini-SWE reference cleanup `ad1bf16f2808fa95f0e8253f3311f6c63e9d5b79`
- Atropos integration removal `5af672c7530263544a9f5e2479f3853d83b3b798`
