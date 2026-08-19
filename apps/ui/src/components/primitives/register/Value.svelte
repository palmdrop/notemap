<script lang="ts">
  import type { Snippet } from "svelte";

  /** Nothing there yet, which is muted rather than absent. */
  let { empty = false, children }: { empty?: boolean; children: Snippet } =
    $props();
</script>

<div class="col-start-2 min-w-0 font-mono {empty ? 'text-ink-muted' : ''}">
  {@render children()}
</div>
