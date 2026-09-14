<script lang="ts">
  /**
   * What a person wrote. A CommonMark renderer goes behind this interface; until
   * one is chosen the text is drawn as it was typed, which is never wrong, only
   * unformatted.
   */
  let { text }: { text: string } = $props();

  const paragraphs = $derived(
    text.split(/\n{2,}/).filter((each) => each.trim() !== ""),
  );
</script>

<div class="max-w-prose">
  {#each paragraphs as paragraph, at (at)}
    <p
      class="m-0 break-words whitespace-pre-wrap {at > 0 ? 'indent-[3ch]' : ''}"
    >
      {paragraph}
    </p>
  {/each}
</div>
