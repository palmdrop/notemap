<script lang="ts">
  import type { RoutingRecord, RoutingSummary } from "@notemap/client";

  import { client } from "$lib/client";
  import { whereItWent, wentTo } from "$lib/routing";

  /**
   * Where the item went, in the rail. The summary is what a page of items
   * carries; the records are what the one open row read, and say more.
   */
  let {
    summary,
    records = [],
  }: {
    summary: RoutingSummary | undefined;
    records?: readonly RoutingRecord[];
  } = $props();

  const destinations = client.destinations.all;

  /** An id says nothing a person can read, so an unread destination is unnamed. */
  const nameOf = $derived(
    (id: string) =>
      $destinations.find((one) => one.id === id)?.name ?? "a destination",
  );

  const lines = $derived(
    records.length > 0
      ? records.map((record) => `${wentTo(record, nameOf)} · ${record.state}`)
      : summary === undefined
        ? []
        : [whereItWent(summary, nameOf)],
  );
</script>

<div class="mt-2">
  {#if lines.length === 0}
    <div class="text-ink-muted">unrouted</div>
  {:else}
    {#each lines as line (line)}
      <div class="break-words">
        <span aria-hidden="true" class="text-accent">→</span>
        {line}
      </div>
    {/each}
  {/if}
</div>
