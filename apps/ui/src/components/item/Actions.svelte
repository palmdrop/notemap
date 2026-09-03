<script lang="ts">
  import { saidBy, type Item } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import ActionRow from "$components/primitives/controls/ActionRow.svelte";
  import { client } from "$lib/client";
  import { nameOf } from "$lib/destinations";
  import { editable } from "$lib/lineage";
  import { notices } from "$lib/notices.svelte";
  import { saidOf } from "$lib/routing";

  /**
   * `address` is where this item is read, and is absent on the surface that
   * already is it.
   */
  let {
    item,
    offline,
    address,
    onroute,
    onedit,
  }: {
    item: Item;
    offline: boolean;
    address?: string;
    onroute: () => void;
    onedit: () => void;
  } = $props();

  /** What this row did, and only that: a failed read is said where it was read. */
  let said = $state("");

  const mayEdit = $derived(editable(item));

  function archive() {
    void client.archive(item.id);
    notices.raise({ what: "archived" });
  }

  async function markDone() {
    said = "marking…";
    try {
      notices.raise(
        saidOf(await client.routing.markProcessed(item.id), nameOf),
      );
      said = "";
    } catch (error) {
      said = saidBy(error);
    }
  }
</script>

<ActionRow>
  <!-- An archive, an edit and a tag replay from the outbox; a delivery
       cannot, so it is not offered rather than promised. -->
  <Action primary disabled={offline} onclick={onroute}>route</Action>
  <Action disabled={offline} onclick={markDone}>mark done</Action>
  <Action onclick={archive}>archive</Action>
  <!-- A processed item is not this row's to rewrite: editing it would
       append a revision, which the queue is not where to do. -->
  {#if mayEdit}
    <Action onclick={onedit}>edit</Action>
  {/if}

  <!-- Somewhere to go rather than something to do, and last, so the gesture
       that opens a row in place is never the one that leaves it. -->
  {#if address !== undefined}
    <Action href={address}>open</Action>
  {/if}

  {#if said !== ""}
    <span role="status" class="text-ink-muted">{said}</span>
  {/if}
</ActionRow>
