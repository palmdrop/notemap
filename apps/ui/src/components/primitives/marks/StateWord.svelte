<script lang="ts">
  /** `failed` is the accent, which only what went wrong may spend. */
  let {
    word,
    inline = false,
    failed = false,
  }: { word: string; inline?: boolean; failed?: boolean } = $props();
</script>

<span
  class="w-max max-w-full font-mono break-words {failed
    ? 'inverted-accent'
    : 'inverted'} {inline ? 'inline-block' : 'mt-2 block'}">{word}</span
>
