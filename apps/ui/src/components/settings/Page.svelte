<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * A page of settings, at a narrower measure than the register and in one
   * column. Everything on it is one type size: what separates a section from a
   * destination from a field is capitals, how wide they are set, and a rule.
   */
  let { lede, children }: { lede: string; children: Snippet } = $props();
</script>

<div class="max-w-[var(--spacing-read)] pt-10 font-mono">
  <p class="m-0 text-ink-muted">{lede}</p>
  {@render children()}
</div>
