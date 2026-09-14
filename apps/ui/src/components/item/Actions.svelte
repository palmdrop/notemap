<script lang="ts">
  import { saidBy, type Item } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import { client } from "$lib/client";
  import { copyable } from "$lib/clipboard";
  import { aboutItem } from "$lib/excerpt";
  import { editable } from "$lib/lineage";
  import { notices } from "$lib/notices.svelte";
  import { DISCARD, MANUAL, refusalFor } from "$lib/processing";
  import { discard, manual } from "$lib/quick";

  /**
   * The quick tier on the left — every decision that needs no destination —
   * and working with the item on the right. `address` is where this item is
   * read, and is absent on the surface that already is it.
   */
  let {
    item,
    address,
    offline = false,
    onprocess,
    onedit,
  }: {
    item: Item;
    address?: string;
    offline?: boolean;
    onprocess: () => void;
    onedit: () => void;
  } = $props();

  /** What this row did, and only that: a failed read is said where it was read. */
  let said = $state("");

  const mayEdit = $derived(editable(item));
  const archived = $derived(item.archived !== undefined);

  const cannotMark = $derived(refusalFor(MANUAL, item, offline));
  const cannotDiscard = $derived(refusalFor(DISCARD, item, offline));

  /** What `copy` would take. A picture with no caption says nothing, and an
      action that would put nothing on the clipboard is not offered. */
  const holds = $derived(client.says(item));

  function unarchive() {
    void client.unarchive(item.id).catch((error: unknown) => {
      said = saidBy(error);
    });
  }

  /**
   * The one action here whose result is nowhere on the screen: everything else
   * either changes the row or takes you somewhere. So it is the one that is
   * said, and it names what it took rather than saying *copied* into the air.
   */
  async function copy() {
    try {
      await navigator.clipboard.writeText(holds);
      notices.raise({ what: "copied", about: aboutItem(item) });
    } catch (error) {
      said = saidBy(error);
    }
  }
</script>

<div
  class="flex w-full min-w-0 flex-wrap items-baseline justify-between gap-x-5"
>
  <div class="flex flex-wrap items-baseline gap-x-5 max-narrow:gap-x-3">
    <!-- One door into the deep tier, and never disabled: what a decision needs
         of the pool is that surface's to say. -->
    <Action primary onclick={onprocess}>process</Action>

    <Action
      disabled={cannotMark !== undefined}
      title={cannotMark}
      onclick={() => void manual(item)}
    >
      manual
    </Action>

    <Action
      alarm
      disabled={cannotDiscard !== undefined}
      title={cannotDiscard}
      onclick={() => discard(item)}
    >
      discard
    </Action>

    {#if archived}
      <!-- Not processing: this puts the item back rather than sending it away,
           and a door that means both means neither. Unarchiving leaves the row
           in front of the reader, so it says nothing of what it did — only what
           it could not do. -->
      <Action onclick={unarchive}>unarchive</Action>
    {/if}
  </div>

  <div class="flex flex-wrap items-baseline gap-x-5 max-narrow:gap-x-3">
    <!-- A processed item is not this row's to rewrite: editing it would
         append a revision, which the queue is not where to do. -->
    {#if mayEdit}
      <Action onclick={onedit}>edit</Action>
    {/if}

    <!-- Offered only where the browser has a clipboard to give: without a
         secure context there is nothing to fall back to. -->
    {#if copyable() && holds !== ""}
      <Action onclick={() => void copy()}>copy</Action>
    {/if}

    <!-- Somewhere to go rather than something to do, and last, so the gesture
         that selects a row in place is never the one that leaves it. -->
    {#if address !== undefined}
      <Action href={address}>open</Action>
    {/if}
  </div>
</div>

{#if said !== ""}
  <div role="status" class="mt-2 text-alarm">{said}</div>
{/if}
