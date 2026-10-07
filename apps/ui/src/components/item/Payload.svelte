<script lang="ts">
  import type { Item } from "@notemap/client";

  import Clamp from "$components/primitives/text/Clamp.svelte";
  import Figure from "$components/primitives/text/Figure.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import Unfurls from "$components/unfurl/Unfurls.svelte";
  import { client } from "$lib/client";

  import Attachments from "./Attachments.svelte";

  let { item }: { item: Item } = $props();

  const attachments = $derived(client.attachments(item));
  const text = $derived(client.says(item));
</script>

<Attachments {attachments} picture="max-h-96" />

{#if text !== ""}
  <Clamp>
    <Prose {text} />
  </Clamp>
  <Unfurls {text} />
{:else if attachments.length === 0}
  <!-- Nothing this shell knows how to draw, which is said by name rather than hidden. -->
  <Figure label={item.payload.type} />
{/if}
