<script lang="ts">
  import { copyable } from "$lib/clipboard";
  import { hasPicture, wordsOf, type RefusedCapture } from "$lib/refused";
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
</script>

<Entry
  when={timeOf(held.at)}
  what={`capture refused${held.failure === undefined ? "" : `: ${held.failure}`}`}
  why={[words, hasPicture(held) ? "with a picture" : undefined]
    .filter((part) => part !== undefined && part !== "")
    .join("\n")}
  alarm
>
  {#snippet actions()}
    {#if asked}
      <span>delete it for good?</span>
      <button type="button" class="underline" onclick={ondelete}>delete</button>
      <button type="button" class="underline" onclick={() => (asked = false)}
        >keep</button
      >
    {:else}
      {#if copyable() && words !== ""}
        <button type="button" class="underline" onclick={oncopy}>copy</button>
      {/if}
      <button type="button" class="underline" onclick={onedit}>edit</button>
      <button type="button" class="underline" onclick={() => (asked = true)}
        >delete</button
      >
    {/if}
  {/snippet}
</Entry>
