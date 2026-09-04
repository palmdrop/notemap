<script lang="ts">
  import { saidBy, type Item } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import ActionGrid from "$components/primitives/controls/ActionGrid.svelte";
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

  /** Open, `done` is waiting for where it went; `⏎` sends it, empty or not. */
  let where = $state<string | undefined>(undefined);
  let field = $state<HTMLInputElement | undefined>(undefined);

  $effect(() => {
    if (where !== undefined) field?.focus();
  });

  const mayEdit = $derived(editable(item));
  const archived = $derived(item.archived !== undefined);

  /**
   * Marking processed is routing whose destination is the person, so an item
   * whose summary already names them has been marked and is not asked again.
   */
  const marked = $derived(
    item.routing?.to.some((went) => went.kind === "user") === true,
  );

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
    if (where === undefined) {
      where = "";
      return;
    }

    const note = where.trim();
    const went = onwent?.();
    const about = aboutItem(item);
    where = undefined;
    said = "marking…";
    try {
      const record = await client.routing.markProcessed(
        item.id,
        note === "" ? undefined : note,
      );
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

  /**
   * The one action here whose result is nowhere on the screen: everything else
   * either changes the row or takes you somewhere. So it is the one that is
   * said, and it names what it took rather than saying *copied* into the air.
   */
  async function copy() {
    try {
      await navigator.clipboard.writeText(client.says(item));
      notices.raise({ what: "copied", about: aboutItem(item) });
    } catch (error) {
      said = saidBy(error);
    }
  }
</script>

<ActionGrid>
  {#snippet leaving()}
    <!-- An archive, an edit and a tag replay from the outbox; a delivery
         cannot, so it is not offered rather than promised. -->
    <Action cell primary disabled={offline} onclick={onroute}>route</Action>

    {#if !marked}
      <Action cell disabled={offline} onclick={() => void markDone()}>
        done
      </Action>
    {/if}

    {#if archived}
      <!-- Unarchiving leaves the row in front of the reader, so it says nothing. -->
      <Action cell onclick={() => void client.unarchive(item.id)}>
        unarchive
      </Action>
    {:else}
      <Action cell onclick={archive}>archive</Action>
    {/if}
  {/snippet}

  {#snippet working()}
    <Action cell onclick={() => void copy()}>copy</Action>

    <!-- A processed item is not this row's to rewrite: editing it would
         append a revision, which the queue is not where to do. -->
    {#if mayEdit}
      <Action cell onclick={onedit}>edit</Action>
    {/if}

    <!-- Somewhere to go rather than something to do, and last, so the gesture
         that opens a row in place is never the one that leaves it. -->
    {#if address !== undefined}
      <Action cell href={address}>open</Action>
    {/if}
  {/snippet}
</ActionGrid>

{#if where !== undefined}
  <input
    bind:this={field}
    bind:value={where}
    onkeydown={(event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void markDone();
      } else if (event.key === "Escape") {
        event.preventDefault();
        where = undefined;
      }
    }}
    placeholder="where it went — optional"
    aria-label="where it went"
    class="mt-3 w-full px-2 py-0.5 font-mono outline-none field placeholder:text-ink-muted"
  />
{/if}

{#if said !== ""}
  <div role="status" class="mt-3 font-mono text-ink-muted">{said}</div>
{/if}
