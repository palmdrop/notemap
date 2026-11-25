<script lang="ts">
  import Box from "$components/primitives/blocks/Box.svelte";
  import { copyable } from "$lib/clipboard";
  import { attachmentCount, wordsOf, type RefusedCapture } from "$lib/refused";
  import { timeOf } from "$lib/stamp";

  import Entry from "./Entry.svelte";

  /**
   * A capture the pool refused, held until somebody decides: its words whole,
   * since nothing else holds them, and the ways out. Deleting is the one that
   * loses it, so it is asked.
   */
  let {
    held,
    oncopy,
    onedit,
    ondelete,
  }: {
    held: RefusedCapture;
    oncopy: () => void;
    onedit: () => void;
    ondelete: () => void;
  } = $props();

  let asked = $state(false);

  const words = $derived(wordsOf(held));
  const carried = $derived(attachmentCount(held));
</script>

<Entry
  when={timeOf(held.at)}
  what={`Refused by the pool${held.failure === undefined ? "" : `: ${held.failure}`}`}
  why={[
    words,
    carried === 0
      ? undefined
      : carried === 1
        ? "with an attachment"
        : `with ${String(carried)} attachments`,
  ]
    .filter((part) => part !== undefined && part !== "")
    .join("\n")}
  alarm
>
  {#snippet actions()}
    {#if asked}
      <span>delete it for good?</span>
      <Box danger onclick={ondelete}>delete</Box>
      <Box onclick={() => (asked = false)}>keep</Box>
    {:else}
      {#if copyable() && words !== ""}
        <Box icon="copy" onclick={oncopy}>copy</Box>
      {/if}
      <Box icon="edit" onclick={onedit}>edit</Box>
      <Box danger onclick={() => (asked = true)}>delete</Box>
    {/if}
  {/snippet}
</Entry>
