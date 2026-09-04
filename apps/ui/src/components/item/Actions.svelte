<script lang="ts">
  import { saidBy, type Item } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import ActionRow from "$components/primitives/controls/ActionRow.svelte";
  import { client } from "$lib/client";
  import { nameOf } from "$lib/destinations";
  import { aboutItem } from "$lib/excerpt";
  import { editable } from "$lib/lineage";
  import { notices } from "$lib/notices.svelte";
  import { keyFor, saidOf } from "$lib/routing";

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
    /**
     * The item is on its way out of a list. Asked before the pool is, because
     * where the row stood is gone by the time it answers, and what it hands
     * back is told what became of the item. A surface that keeps its subject in
     * front of the reader gives none, and nothing here is said in the corner:
     * the thing itself is the evidence, and a notice about it would be a second
     * voice saying what the reader is already looking at.
     */
    onwent?: () => (going: string) => void;
  } = $props();

  /** What this row did, and only that: a failed read is said where it was read. */
  let said = $state("");

  const mayEdit = $derived(editable(item));
  const archived = $derived(item.archived !== undefined);

  /**
   * Said at once, the way every outbox operation is: enqueueing it is what the
   * shell knows, a pool that then refuses it is the corner's to say, and only a
   * store that could not take it at all leaves this row the one able to report.
   */
  function archive() {
    const went = onwent?.();
    if (went !== undefined) {
      notices.raise({ what: "archived", about: aboutItem(item) });
      went("archived");
    }

    void client.archive(item.id).catch((error: unknown) => {
      said = saidBy(error);
    });
  }

  async function markDone() {
    const went = onwent?.();
    const about = aboutItem(item);
    said = "marking…";
    try {
      const record = await client.routing.markProcessed(item.id);
      if (went === undefined) {
        // Quiet, but remembered: the pool writes this decision to the log, and
        // the corner would read it back minutes later as news.
        notices.mark(keyFor(record.id));
      } else {
        notices.raise(saidOf(record, nameOf, about));
        went("done");
      }
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
  {#if archived}
    <!-- Unarchiving leaves the row in front of the reader, so it says nothing. -->
    <Action onclick={() => void client.unarchive(item.id)}>unarchive</Action>
  {:else}
    <Action onclick={archive}>archive</Action>
  {/if}
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
