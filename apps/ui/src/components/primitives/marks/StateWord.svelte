<script lang="ts">
  /** What became of an item: `routed`, `archived`. Never more than one. */
  let { word }: { word: string } = $props();
</script>

<span class="inverted mt-2 block w-max font-mono">{word}</span>
