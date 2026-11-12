<script lang="ts">
  import { itemHref } from "$components/item/href";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";

  import Says from "./Says.svelte";

  /**
   * An item a batch refused or left as it was. The pool writes nothing for
   * either, so this is drawn from the answer the client holds, and has no time.
   */
  let {
    subject,
    word,
    fact,
    alarm = false,
  }: {
    subject: string;
    word: string;
    fact?: string;
    alarm?: boolean;
  } = $props();
</script>

<div class="col-span-full grid grid-cols-subgrid">
  <Rail>
    <div class="tracking-caps uppercase {alarm ? 'text-alarm' : ''}">
      {word}
    </div>
  </Rail>

  <Body>
    <div
      class="flex items-baseline justify-between gap-x-[3ch] max-narrow:flex-col max-narrow:items-stretch"
    >
      <span class="min-w-0 truncate">
        <Says id={subject} href={itemHref(subject)} />
      </span>
      {#if fact !== undefined}
        <span class="shrink-0 {alarm ? 'text-alarm' : ''}">{fact}</span>
      {/if}
    </div>
  </Body>
</div>
