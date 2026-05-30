# 🦐 Qwen3.5 Thinking Control on LM Studio / llama.cpp

Date: --
Status: Research

## Question

How should Shrimpy disable reasoning for a Qwen3.5 model when the model is hosted through an LM Studio / llama.cpp / GGUF-style stack?

## Short answer

Not every "OpenAI-compatible Qwen3.5 endpoint" wants the same disable-thinking parameter:

- Qwen3.5 thinks by default.
- Qwen3.5 does not use the old Qwen soft-switch commands like `/think` and `/nothink`.
- DashScope / Alibaba Model Studio wants top-level `enable_thinking`.
- vLLM and SGLang want `chat_template_kwargs.enable_thinking`.
- Raw llama.cpp does not expose the hard switch directly; Qwen's documented workaround is a custom chat template passed with `--chat-template-file`.
- LM Studio clearly supports an "Enable Thinking" model field in `model.yaml`, but its OpenAI-compatible API docs do not document a per-request `enableThinking` or `enable_thinking` parameter.

That means Shrimpy cannot assume one generic "Qwen off switch" will work across all local hosts.

## What upstream says

### 1. Qwen3.5 defaults to thinking

The official Qwen3.5 model card says the model operates in thinking mode by default and that disabling thinking requires API parameters rather than prompt commands.

The same model card also says Qwen3.5 does not officially support the Qwen3 soft switch (`/think` / `/nothink`).

### 2. Qwen documents different off-switches for different hosts

For non-thinking mode, the official Qwen3.5 model card shows two different API shapes:

- Alibaba Cloud Model Studio: `enable_thinking: false`
- OpenAI-compatible servers backed by vLLM or SGLang: `chat_template_kwargs: { "enable_thinking": false }`

This is not cosmetic. It means the disable path is host-specific.

### 3. Qwen's llama.cpp docs call out a real limitation

The official Qwen llama.cpp guide says the hard switch in the chat template is not exposed in llama.cpp.

Qwen's documented workaround is to pass a custom chat template equivalent to always setting `enable_thinking=False` with `--chat-template-file`.

That is the key fact for GGUF hosting. If the host is basically llama.cpp serving a GGUF and it has not wired the chat-template variable through, request-body flags alone may do nothing.

### 4. LM Studio adds a model-defined "Enable Thinking" field

The official LM Studio `model.yaml` docs show a custom boolean field:

```yaml
customFields:
  - key: enableThinking
    displayName: Enable Thinking
    type: boolean
    defaultValue: true
    effects:
      - type: setJinjaVariable
        variable: enable_thinking
```

LM Studio's docs say this works by setting a Jinja variable, and explicitly note that the template must contain an `enable_thinking` variable for it to work.

LM Studio's Qwen model pages also expose "Enable Thinking" as a model-level custom field for Qwen3.5.

The LM Studio Qwen3.5 `model.yaml` makes that concrete. The published model config uses a custom field named `enableThinking` that sets the Jinja variable `enable_thinking`:

```yaml
customFields:
  - key: enableThinking
    displayName: Enable Thinking
    description: Controls whether the model will think before replying
    type: boolean
    defaultValue: true
    effects:
      - type: setJinjaVariable
        variable: enable_thinking
```

That matters because it shows LM Studio's control point is template-driven model configuration, not necessarily an OpenAI-compatible request parameter that a client like Shrimpy can toggle per session.

### 5. LM Studio's OpenAI-compatible docs do not document a per-request thinking toggle

LM Studio's OpenAI-compatible Chat Completions docs list standard payload parameters like `temperature`, `top_p`, `top_k`, `max_tokens`, and penalties.

I did not find official LM Studio developer docs that document a per-request `enableThinking`, `enable_thinking`, or `chat_template_kwargs.enable_thinking` field for the OpenAI-compatible API.

That does not prove such a path is impossible, but it does mean Shrimpy should not assume the LM Studio server honors the same request body that vLLM or DashScope use.

## What Pi currently sends

Pi already has two Qwen-compatible request shapes for OpenAI-compatible providers:

- `thinkingFormat: "qwen"` sends top-level `enable_thinking`
- `thinkingFormat: "qwen-chat-template"` sends `chat_template_kwargs.enable_thinking`

Those mappings line up with the official Qwen API examples for DashScope and vLLM/SGLang.

They do not solve the raw llama.cpp case described in Qwen's own docs, because llama.cpp's issue is that the hard switch lives in the chat template and is not exposed directly.

## Local probe against `localhost:1234`

On April 18, 2026, I probed `http://localhost:1234/v1/chat/completions` with the following request shapes against `qwen/qwen3.5-35b-a3b`:

- No thinking toggle
- Top-level `enable_thinking: false`
- `chat_template_kwargs: { "enable_thinking": false }`

All three responses still returned `choices[0].message.reasoning_content`.

Example result shape:

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "",
        "reasoning_content": "Thinking Process: ..."
      },
      "finish_reason": "length"
    }
  ]
}
```

The server also identifies itself as `X-Powered-By: Express`.

Inference from that observation:

- the current backend is not honoring either Qwen disable shape that Pi can send
- the host may be a custom wrapper in front of llama.cpp or another engine
- if it is GGUF + llama.cpp underneath, the behavior is consistent with Qwen's warning that the hard switch is not exposed unless the chat template is wired for it

That inference is plausible, but not proven from headers alone.

## Implications for Shrimpy

- `/thinking` is only trustworthy when the provider's disable semantics are verified end to end.
- A provider that merely emits reasoning tokens is not automatically a provider with controllable reasoning effort.
- For Qwen3.5, the real question is "what exact host stack is behind this endpoint?"

The practical matrix looks like this:

- DashScope / Alibaba Model Studio: use top-level `enable_thinking`
- vLLM / SGLang OpenAI-compatible server: use `chat_template_kwargs.enable_thinking`
- Raw llama.cpp / llama-server with GGUF: disable requires chat-template support or a custom `--chat-template-file`
- LM Studio: Qwen3.5's published `model.yaml` exposes `Enable Thinking` by setting the `enable_thinking` Jinja variable, but official API docs still do not currently show a documented per-request toggle on the OpenAI-compatible endpoint

For `dgx_spark_lms`, the honest state is:

- Shrimpy can send both known Qwen disable shapes through Pi
- the current endpoint still returns reasoning content
- therefore reasoning disable is not verified for this provider

Until the backend is understood and tested, Shrimpy should treat provider-side thinking control here as unsupported or unverified, not as a working feature.

## Future direction: vLLM

If this stack moves to vLLM later, the path becomes much cleaner.

Qwen's official guidance for OpenAI-compatible vLLM serving is to send:

```json
{
  "chat_template_kwargs": {
    "enable_thinking": false
  }
}
```

That matches Pi's existing `thinkingFormat: "qwen-chat-template"` support, so a future vLLM-backed provider is a much better fit for real per-session `/thinking` control than an LM Studio or raw llama.cpp GGUF stack unless that stack explicitly exposes the toggle end to end.

## Sources

- [Qwen3.5-35B-A3B model card](https://huggingface.co/Qwen/Qwen3.5-35B-A3B)
- [Qwen llama.cpp guide](https://qwen.readthedocs.io/en/latest/run_locally/llama.cpp.html)
- [Qwen LM Studio guide](https://qwen.readthedocs.io/en/latest/run_locally/lmstudio.html)
- [LM Studio model.yaml docs](https://lmstudio.ai/docs/app/modelyaml)
- [LM Studio Qwen3.5-35B-A3B model page](https://lmstudio.ai/models/qwen/qwen3.5-35b-a3b)
- [LM Studio OpenAI-compatible API overview](https://lmstudio.ai/docs/developer/openai-compat)
- [LM Studio OpenAI-compatible Chat Completions docs](https://lmstudio.ai/docs/developer/openai-compat/chat-completions)
