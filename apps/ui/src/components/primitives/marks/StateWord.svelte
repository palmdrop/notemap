<script lang="ts">
  let { word, inline = false }: { word: string; inline?: boolean } = $props();
</script>

<span class="inverted w-max font-mono {inline ? 'inline-block' : 'mt-2 block'}"
  >{word}</span
>
