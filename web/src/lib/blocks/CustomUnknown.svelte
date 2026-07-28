<script lang="ts">
  import FoldedRecord from "./FoldedRecord.svelte";
  import { stringifyRecord } from "../records";

  interface Props {
    customType: string;
    data: unknown;
    collapsed: boolean;
  }
  let { customType, data, collapsed }: Props = $props();
  const body = $derived(stringifyRecord(data));
  const summary = $derived(
    typeof data === "string"
      ? `${(data as string).length} chars`
      : Array.isArray(data)
        ? `${data.length} items`
        : typeof data,
  );
</script>

<FoldedRecord label={customType} {summary} {body} {collapsed} />
