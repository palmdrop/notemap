<script lang="ts">
  import { highlighting } from "$lib/highlighting";
  import { rendered } from "$lib/markdown";

  /** What a person wrote, or a destination wrote for them: CommonMark, drawn. */
  let {
    text,
    full = false,
    terms = [],
  }: {
    text: string;
    full?: boolean;
    /** Folded search terms, highlighted wherever the drawn text holds them. */
    terms?: readonly string[];
  } = $props();

  const html = $derived(rendered(text));

  // A prop read off a store counts as changed at every emission, even when it
  // is the same array; the highlight is taken again only for new terms.
  const searched = $derived(terms);
</script>

<!-- Drawn afresh with the html, so the highlight is taken again in the nodes
     that replace the ones it pointed into. -->
{#key html}
  <div
    class="rendered break-words {full ? '' : 'max-w-prose'}"
    {@attach highlighting(searched)}
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- `rendered` escapes the source's own HTML -->
    {@html html}
  </div>
{/key}
