<script lang="ts">
  import type { Item } from "@notemap/client";

  import Clamp from "$components/primitives/text/Clamp.svelte";
  import Figure from "$components/primitives/text/Figure.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import Unfurls from "$components/unfurl/Unfurls.svelte";
  import { client } from "$lib/client";

  import AttachedLines from "./AttachedLines.svelte";
  import AttachedPictures from "./AttachedPictures.svelte";

  let { item }: { item: Item } = $props();

  const attachments = $derived(client.attachments(item));
  const text = $derived(client.says(item));
</script>

<AttachedPictures {attachments} picture="max-h-96" />

{#if text !== ""}
  <Clamp>
    <Prose {text} />
  </Clamp>
{/if}

<AttachedLines {attachments} ruled={text !== ""} />

{#if text !== ""}
  <Unfurls {text} />
{:else if attachments.length === 0}
  <!-- Nothing this shell knows how to draw, which is said by name rather than hidden. -->
  <Figure label={item.payload.type} />
{/if}
