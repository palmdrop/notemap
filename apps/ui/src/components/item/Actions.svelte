<script lang="ts">
  import { saidBy, type Item } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import ActionRow from "$components/primitives/controls/ActionRow.svelte";
  import { client } from "$lib/client";
  import { nameOf } from "$lib/destinations";
  import { aboutItem } from "$lib/excerpt";
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
    onwent,
  }: {
    item: Item;
    offline: boolean;
    address?: string;
    onroute: () => void;
    onedit: () => void;
    /** The item left. Where its row stood is the register's to know, not this row's. */
    onwent?: (word: string) => void;
  } = $props();

  /** What this row did, and only that: a failed read is said where it was read. */
  let said = $state("");

  const mayEdit = $derived(editable(item));

  function archive() {
    void client.archive(item.id);
    notices.raise({ what: "archived", about: aboutItem(item) });
    onwent?.("archived");
  }

  async function markDone() {
    said = "marking…";
    try {
      const record = await client.routing.markProcessed(item.id);
      notices.raise(saidOf(record, nameOf, aboutItem(item)));
      onwent?.("done");
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
