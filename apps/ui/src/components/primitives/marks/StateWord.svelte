<script lang="ts">
  /**
   * `failed` is the alarm, which only what went wrong may spend. `inverted` is
   * the log's: the kind of an action is the row's heading, ink behind it.
   */
  let {
    word,
    inline = false,
    failed = false,
    inverted = false,
  }: {
    word: string;
    inline?: boolean;
    failed?: boolean;
    inverted?: boolean;
  } = $props();

  const look = $derived(
    inverted
      ? `px-1.5 text-ground ${failed ? "bg-alarm" : "bg-ink"}`
      : failed
        ? "text-alarm"
        : "",
  );
</script>

<span
  class="w-max max-w-full break-words {look} {inline
    ? 'inline-block'
    : 'mt-2 block'}">{word}</span
>
