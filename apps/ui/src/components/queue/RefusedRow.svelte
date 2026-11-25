<script lang="ts">
  import Box from "$components/primitives/blocks/Box.svelte";
  import Icon from "$components/primitives/icon/Icon.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import { copyable } from "$lib/clipboard";
  import {
    attachmentCount,
    copyRefused,
    deleteRefused,
    editRefused,
    wordsOf,
    type RefusedCapture,
  } from "$lib/refused";
  import { timeOf } from "$lib/stamp";

  /**
   * A capture the pool refused, as a row of the queue: its words, why, and
   * that it is kept on this device only, until it is changed or deleted.
   * Delete asks first: this is the only copy.
   */
  let { held }: { held: RefusedCapture } = $props();

  let asked = $state(false);

  const words = $derived(wordsOf(held));
  const carried = $derived(attachmentCount(held));
</script>

<Rail>
  <span class="text-time tabular-nums">{timeOf(held.at)}</span>
</Rail>
<Body>
  <div data-refused={held.id}>
    {#if words !== ""}
      <p class="m-0 break-words whitespace-pre-wrap">{words}</p>
    {/if}
    {#if carried > 0}
      <p class="m-0 text-small text-muted">
        {carried === 1
          ? "with an attachment"
          : `with ${String(carried)} attachments`}
      </p>
    {/if}
    <p
      class="mt-2 mb-0 flex items-start gap-2 text-small text-danger"
      role="status"
    >
      <Icon name="cloud-off" class="mt-px size-4 flex-none" />
      <span
        >Refused by the pool{held.failure === undefined
          ? ""
          : `: ${held.failure}`}. Kept on this device only, until it is changed
        or deleted.</span
      >
    </p>
    <div class="mt-2 flex flex-wrap items-center gap-2">
      {#if asked}
        <span class="text-small">Delete it for good?</span>
        <Box danger onclick={() => void deleteRefused(held)}>Delete</Box>
        <Box onclick={() => (asked = false)}>Keep</Box>
      {:else}
        {#if copyable() && words !== ""}
          <Box icon="copy" onclick={() => void copyRefused(held)}>Copy</Box>
        {/if}
        <Box icon="edit" onclick={() => void editRefused(held)}>Edit</Box>
        <Box icon="trash" danger onclick={() => (asked = true)}>Delete</Box>
      {/if}
    </div>
  </div>
</Body>
