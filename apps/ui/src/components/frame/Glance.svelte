<script lang="ts">
  import { client } from "$lib/client";

  /**
   * Two squares under the menu: today's date, and how much was captured
   * today. Read at a glance; nothing to press.
   */
  const captured = client.counts.capturedToday;

  let now = $state(new Date());
  $effect(() => {
    const ticking = setInterval(() => {
      const then = now;
      now = new Date();
      // A new day is a new count: the one held is yesterday's.
      if (now.toDateString() !== then.toDateString()) {
        void client.counts.load().catch(() => undefined);
      }
    }, 60_000);
    return () => clearInterval(ticking);
  });

  const month = $derived(now.toLocaleDateString(undefined, { month: "long" }));
</script>

<div aria-label="Today" role="group" class="grid grid-cols-2 gap-3 p-gutter">
  <div
    class="flex min-h-26 flex-col justify-between rounded-control bg-tag p-3"
  >
    <span class="text-small text-tag-ink">{month}</span>
    <span class="font-display text-figure tabular-nums">{now.getDate()}</span>
  </div>
  <div
    class="flex min-h-26 flex-col justify-between rounded-control bg-tag p-3"
  >
    <span class="text-small text-tag-ink">Captured today</span>
    <span class="font-display text-figure tabular-nums">{$captured ?? "–"}</span
    >
  </div>
</div>
