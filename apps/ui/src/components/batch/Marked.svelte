<script lang="ts">
  import type { BatchAction, Item } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import { notes } from "$lib/batching";

  /**
   * What the rows marked for a batch can be given, held in the list's head
   * while any are marked. `discard` is offered where something marked is not
   * discarded, `undiscard` where something is. Tags are changed on the rows.
   */
  let {
    marked,
    onbatch,
    onall,
    onclear,
  }: {
    marked: readonly Item[];
    onbatch: (action: BatchAction) => void;
    onall: () => void;
    onclear: () => void;
  } = $props();

  const discardable = $derived(
    marked.some((item) => item.archived === undefined),
  );
  const undiscardable = $derived(
    marked.some((item) => item.archived !== undefined),
  );
</script>

<span class="whitespace-nowrap">{notes(marked.length)} marked</span>

{#if discardable}
  <Action alarm onclick={() => onbatch({ kind: "archive" })}>discard</Action>
{/if}
{#if undiscardable}
  <Action onclick={() => onbatch({ kind: "unarchive" })}>undiscard</Action>
{/if}
<Action onclick={onall}>all</Action>
<Action onclick={onclear}>clear</Action>
