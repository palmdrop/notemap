<script lang="ts">
  import Action from "$components/primitives/controls/Action.svelte";

  /** Asked on leaving the composer with a decision begun and not sent. */
  let { onanswer }: { onanswer: (leave: boolean) => void } = $props();

  const id = $props.id();

  function modal(dialog: HTMLDialogElement): () => void {
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-stay] button")?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }

  let answered = false;
  function answer(leave: boolean): void {
    if (answered) return;
    answered = true;
    onanswer(leave);
  }
</script>

<dialog
  {@attach modal}
  aria-label="Go back to the queue"
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
  <p id="{id}-about" class="px-3 py-2.5">go back to the queue?</p>
  <div
    class="flex items-baseline justify-between border-t border-ink px-3 leading-8"
  >
    <span data-stay class="contents">
      <Action primary onclick={() => answer(false)}>stay</Action>
    </span>
    <Action alarm onclick={() => answer(true)}>leave</Action>
  </div>
</dialog>
