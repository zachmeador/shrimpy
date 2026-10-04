<script lang="ts">
  interface Props { text: string; }
  let { text }: Props = $props();

  interface Token {
    value: string;
    kind: "key" | "string" | "number" | "boolean" | "null" | "plain";
  }

  const formatted = $derived.by(() => {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  });
  const tokens = $derived(tokenize(formatted));

  function tokenize(value: string): Token[] {
    const pattern = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b/g;
    const tokens: Token[] = [];
    let offset = 0;
    for (const match of value.matchAll(pattern)) {
      const index = match.index ?? 0;
      if (index > offset) tokens.push({ value: value.slice(offset, index), kind: "plain" });
      if (match[1]) {
        tokens.push({ value: match[1], kind: match[2] ? "key" : "string" });
        if (match[2]) tokens.push({ value: match[2], kind: "plain" });
      } else if (match[3]) {
        tokens.push({ value: match[3], kind: "number" });
      } else if (match[4]) {
        tokens.push({ value: match[4], kind: "boolean" });
      } else {
        tokens.push({ value: match[5], kind: "null" });
      }
      offset = index + match[0].length;
    }
    if (offset < value.length) tokens.push({ value: value.slice(offset), kind: "plain" });
    return tokens;
  }
</script>

<pre>{#each tokens as token}<span class={token.kind}>{token.value}</span>{/each}</pre>

<style>
  pre {
    margin: 0;
    padding: 9px 11px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font: inherit;
  }
  .key { color: var(--c-agent); }
  .string { color: var(--c-user); }
  .number { color: var(--accent); }
  .boolean { color: var(--c-tool); }
  .null { color: var(--c-system); }
</style>
