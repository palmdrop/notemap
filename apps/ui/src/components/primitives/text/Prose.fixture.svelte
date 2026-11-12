<script lang="ts">
  import type { Readable } from "svelte/store";

  import Prose from "./Prose.svelte";

  /** Read through a store, as a surface reads its filter's words off its page. */
  let {
    text,
    searched,
  }: {
    text: string;
    searched: Readable<{ readonly words: readonly string[] }>;
  } = $props();
</script>

<Prose {text} terms={$searched.words} />
