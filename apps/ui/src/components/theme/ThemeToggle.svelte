<script lang="ts">
  import { theme } from "$lib/theme.svelte";
</script>

<!-- The right corner: the left one belongs to a refusal. -->
<button
  type="button"
  aria-label="Theme"
  onclick={() => theme.next()}
  class="fixed right-4 bottom-4 z-10 font-mono text-ink-muted hover:text-accent"
>
  {theme.choice}
</button>
