<script lang="ts">
  /** `failed` is the alarm, which only what went wrong may spend. */
  let {
    word,
    inline = false,
    failed = false,
  }: { word: string; inline?: boolean; failed?: boolean } = $props();
</script>

<span
  class="w-max max-w-full break-words {failed ? 'text-alarm' : ''} {inline
    ? 'inline-block'
    : 'mt-2 block'}">{word}</span
>
