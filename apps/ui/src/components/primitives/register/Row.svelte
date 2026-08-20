<script lang="ts">
  import type { Snippet } from "svelte";

  /** Room a child out of the row's flow needs, in pixels. See the composer. */
  let { reserve = 0, children }: { reserve?: number; children: Snippet } =
    $props();
</script>

<div
  style:--reserve="{reserve}px"
  class="relative grid min-h-[calc(var(--reserve)+--spacing(6))] grid-cols-[var(--spacing-gutter)_1fr] gap-x-gap gap-y-3 py-6 max-aside:min-h-0 max-narrow:grid-cols-[max-content_1fr] max-narrow:gap-y-2"
>
  {@render children()}
</div>
