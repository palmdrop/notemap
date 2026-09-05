<script lang="ts">
  import { saidBy, type Item } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import ActionLine from "$components/primitives/controls/ActionLine.svelte";
  import { client } from "$lib/client";
  import { copyable } from "$lib/clipboard";
  import { aboutItem } from "$lib/excerpt";
  import { editable } from "$lib/lineage";
  import { notices } from "$lib/notices.svelte";

  /**
   * `address` is where this item is read, and is absent on the surface that
   * already is it.
   */
  let {
    item,
    address,
    onprocess,
    onedit,
  }: {
    item: Item;
    address?: string;
    onprocess: () => void;
    onedit: () => void;
  } = $props();

  /** What this row did, and only that: a failed read is said where it was read. */
  let said = $state("");

  const mayEdit = $derived(editable(item));
  const archived = $derived(item.archived !== undefined);

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

<ActionLine>
  <!-- One door out of the queue, and never disabled: what a decision needs of
       the pool is the composer's to say, and discarding needs nothing. -->
  <Action cell primary onclick={onprocess}>process</Action>

  {#if archived}
    <!-- Not processing: this puts the item back rather than sending it away,
         and a door that means both means neither. Unarchiving leaves the row in
         front of the reader, so it says nothing of what it did — only what it
         could not do. -->
    <Action cell onclick={unarchive}>unarchive</Action>
  {/if}

  <!-- The rest is working with the item rather than deciding about it, which
       the muted ink says now that there is no second line to say it. -->

  <!-- Offered only where the browser has a clipboard to give: without a
       secure context there is nothing to fall back to. -->
  {#if copyable() && holds !== ""}
    <Action cell quiet onclick={() => void copy()}>copy</Action>
  {/if}

  <!-- A processed item is not this row's to rewrite: editing it would
       append a revision, which the queue is not where to do. -->
  {#if mayEdit}
    <Action cell quiet onclick={onedit}>edit</Action>
  {/if}

  <!-- Somewhere to go rather than something to do, and last, so the gesture
       that opens a row in place is never the one that leaves it. -->
  {#if address !== undefined}
    <Action cell quiet href={address}>open</Action>
  {/if}
</ActionLine>

{#if said !== ""}
  <div role="status" class="mt-3 font-mono text-ink-muted">{said}</div>
{/if}
