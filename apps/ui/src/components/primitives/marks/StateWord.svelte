<script lang="ts">
  /** What became of an item: `routed`, `archived`. Never more than one. */
  let { word }: { word: string } = $props();
</script>

<span
  class="inverted mt-2 block w-max font-mono max-narrow:mt-0 max-narrow:ml-2 max-narrow:inline-block"
>
  {word}
</span>
