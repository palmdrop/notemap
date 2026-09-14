<script lang="ts">
  import { rendered } from "$lib/markdown";

  /** What a person wrote, or a destination wrote for them: CommonMark, drawn. */
  let { text, full = false }: { text: string; full?: boolean } = $props();

  const html = $derived(rendered(text));
</script>

<div class="rendered break-words {full ? '' : 'max-w-prose'}">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- `rendered` escapes the source's own HTML -->
  {@html html}
</div>
