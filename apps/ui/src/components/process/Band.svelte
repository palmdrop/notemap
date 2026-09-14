<script lang="ts">
  import type { Snippet } from "svelte";

  /** One band under the destination line: a label and the entries it narrows to. */
  let { name, children }: { name: string; children: Snippet } = $props();
</script>

<div
  class="grid grid-cols-[9rem_1fr] border-t border-ink py-1.5 first:border-t-0 max-narrow:grid-cols-1"
>
  <div class="tracking-caps uppercase">{name}</div>
  <div class="min-w-0">
    {@render children()}
  </div>
</div>
