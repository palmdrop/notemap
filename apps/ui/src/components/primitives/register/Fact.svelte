<script lang="ts">
  import type { Snippet } from "svelte";

  let { name, children }: { name: string; children: Snippet } = $props();
</script>

<div class="contents max-narrow:grid max-narrow:grid-cols-[1fr]">
  <span class="min-w-0 tracking-caps break-words uppercase">{name}</span>
  <span class="min-w-0 break-words">
    {@render children()}
  </span>
</div>
