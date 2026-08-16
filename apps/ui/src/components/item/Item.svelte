<script lang="ts">
  import type {
    components
  } from "$lib/api/generated";

  type Item = components["schemas"]["Item"];

  let { item }: {
    item: Item
  } = $props();
</script>

<article>
  <p>{item.payload.content.text}</p>
</article>