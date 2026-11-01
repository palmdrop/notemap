<script lang="ts">
  import Action from "$components/primitives/controls/Action.svelte";

  /** Asked before a batch is sent: what it will do, to how many, and what it will not do as asked. */
  let {
    question,
    notes,
    verb,
    alarm = false,
    onanswer,
  }: {
    question: string;
    notes: readonly string[];
    /** The word on the button that sends it: `route`, `discard`. */
    verb: string;
    alarm?: boolean;
    onanswer: (go: boolean) => void;
  } = $props();

  const id = $props.id();

  function modal(dialog: HTMLDialogElement): () => void {
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-back] button")?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }

  let answered = false;
  function answer(go: boolean): void {
    if (answered) return;
    answered = true;
    onanswer(go);
  }
</script>

<dialog
  {@attach modal}
  aria-label={question}
  aria-describedby="{id}-about"
  oncancel={(event) => {
    event.preventDefault();
    answer(false);
  }}
  onclose={() => answer(false)}
  onclick={(event) => {
    if (event.target === event.currentTarget) answer(false);
  }}
  class="m-auto w-[min(28rem,calc(100vw-2rem))] border border-ink bg-ground p-0 text-ink backdrop:bg-ground/70"
>
  <div id="{id}-about" class="px-3 py-2.5">
    <p>{question}</p>
    {#each notes as note (note)}
      <p>{note}</p>
    {/each}
  </div>
  <div
    class="flex items-baseline justify-between border-t border-ink px-3 leading-8"
  >
    <span data-back class="contents">
      <Action onclick={() => answer(false)}>back</Action>
    </span>
    <Action primary={!alarm} {alarm} onclick={() => answer(true)}>{verb}</Action
    >
  </div>
</dialog>
