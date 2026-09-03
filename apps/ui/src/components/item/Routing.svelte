<script lang="ts">
  import type { RoutingRecord, RoutingSummary } from "@notemap/client";

  import { recordHref } from "$components/item/href";
  import { client } from "$lib/client";
  import { whereItWent, wentTo } from "$lib/routing";

  /** The records say more than the summary, and only a surface that read them has them. */
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

  /** One line per record, which is what a summary is: the whole of it is read elsewhere. */
  const lines = $derived(
    records.length > 0
      ? records.map((record) => ({
          said: `${wentTo(record, nameOf)} · ${record.state}`,
          href: recordHref(record.item, record.id),
        }))
      : summary === undefined
        ? []
        : [{ said: whereItWent(summary, nameOf), href: undefined }],
  );
</script>

<div class="mt-2">
  {#if lines.length === 0}
    <div class="text-ink-muted">unrouted</div>
  {:else}
    {#each lines as line (line.href ?? line.said)}
      <div class="break-words">
        <span aria-hidden="true" class="text-accent">→</span>
        {#if line.href === undefined}
          {line.said}
        {:else}
          <a href={line.href}>{line.said}</a>
        {/if}
      </div>
    {/each}
  {/if}
</div>
