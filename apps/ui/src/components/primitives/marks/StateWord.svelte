<script lang="ts">
  let { word, inline = false }: { word: string; inline?: boolean } = $props();
</script>

<span
  class="w-max max-w-full break-words {inline ? 'inline-block' : 'mt-2 block'}"
  >{word}</span
>
