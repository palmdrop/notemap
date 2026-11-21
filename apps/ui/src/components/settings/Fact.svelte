<script lang="ts">
  import type { Snippet } from "svelte";

  /** One fact of a settings page: a ruled row, label beside value. */
  let { name, children }: { name: string; children: Snippet } = $props();
</script>

<div
  class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-rule px-gutter py-3"
>
  <span class="text-small text-muted">{name}</span>
  <span class="min-w-0 break-words">
    {@render children()}
  </span>
</div>
