<script lang="ts">
  import type { Snippet } from "svelte";

  /** One step. A settled one stays visible with its choice marked. */
  let { name, children }: { name: string; children: Snippet } = $props();
</script>

<div class="mt-6">
  <div class="tracking-caps uppercase">{name}</div>
  <div class="mt-1.5">{@render children()}</div>
</div>
