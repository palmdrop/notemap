<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * A terse row: the name beside what it holds rather than above it. `Group` is
   * one step of a decision and takes the room a step deserves; this is for what
   * sits alongside the decision without being one.
   */
  let { name, children }: { name: string; children: Snippet } = $props();
</script>

<div class="mt-4 grid grid-cols-[3.6rem_1fr] items-baseline gap-x-4">
  <span class="tracking-caps uppercase">{name}</span>
  <div class="flex min-w-0 flex-wrap items-baseline gap-x-6">
    {@render children()}
  </div>
</div>
