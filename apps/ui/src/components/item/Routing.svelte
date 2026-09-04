<script lang="ts">
  import {
    saidBy,
    type RoutingRecord,
    type RoutingSummary,
  } from "@notemap/client";

  import { recordHref } from "$components/item/href";
  import { client } from "$lib/client";
  import { whereItWent, wentTo } from "$lib/routing";

  /** The records say more than the summary, and only a surface that read them has them. */
  let {
    summary,
    records = [],
    onundone,
  }: {
    summary: RoutingSummary | undefined;
    records?: readonly RoutingRecord[];
    /** A cancelled record leaves what was read of them out of date. */
    onundone?: () => void;
  } = $props();

  let said = $state("");

  const destinations = client.destinations.all;

  /** An id says nothing a person can read, so an unread destination is unnamed. */
  const nameOf = $derived(
    (id: string) =>
      $destinations.find((one) => one.id === id)?.name ?? "a destination",
  );

  /** One line per record, which is what a summary is: the whole of it is read elsewhere. */
  const lines = $derived(
    records.length > 0
      ? records.map((record) => ({
          ...wentTo(record, nameOf),
          href: recordHref(record.item, record.id),
          // Only a decision the person made by hand is theirs to take back:
          // a delivery is the pool's, and cancelling one it has carried out
          // would be undoing something that has already happened elsewhere.
          taken: record.target.kind === "user" ? record : undefined,
        }))
      : summary === undefined
        ? []
        : [
            {
              said: whereItWent(summary, nameOf),
              aside: undefined,
              href: undefined,
              taken: undefined,
            },
          ],
  );

  async function undo(record: RoutingRecord) {
    said = "";
    try {
      await client.routing.cancel(record.id, record.item);
      onundone?.();
    } catch (error) {
      said = saidBy(error);
    }
  }
</script>

<div class="mt-2">
  {#if lines.length === 0}
    <div class="text-ink-muted">unrouted</div>
  {:else}
    {#each lines as line (line.href ?? line.said)}
      <div class="flex flex-wrap items-baseline gap-x-4">
        <span class="min-w-0 break-words">
          <span aria-hidden="true" class="text-accent">→</span>
          {#if line.href === undefined}
            {line.said}
          {:else}
            <a href={line.href}>{line.said}</a>
          {/if}
          <!-- What the person wrote about it, or the one state worth saying. -->
          {#if line.aside !== undefined}
            <span class="text-ink-muted">· {line.aside}</span>
          {/if}
        </span>

        {#if line.taken !== undefined}
          {@const record = line.taken}
          <button
            type="button"
            onclick={() => void undo(record)}
            class="shrink-0 text-ink-muted hover:text-accent">undo</button
          >
        {/if}
      </div>
    {/each}
  {/if}

  {#if said !== ""}
    <div role="status" class="mt-1 text-accent">{said}</div>
  {/if}
</div>
