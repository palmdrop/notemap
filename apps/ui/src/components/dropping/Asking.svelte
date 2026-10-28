<script lang="ts">
  import Action from "$components/primitives/controls/Action.svelte";
  import { sizeOf } from "$lib/attachments";

  /**
   * Files many or large enough to have arrived by accident, laid out before
   * any of them is attached: how many, how much, and the first few by name.
   */
  let {
    files,
    hidden,
    to,
    quoted = false,
    onanswer,
  }: {
    files: readonly File[];
    hidden: number;
    /** What they would be attached to, as the overlay named it. */
    to: string;
    /** A capture named by its words rather than as the capture. */
    quoted?: boolean;
    onanswer: (attach: boolean) => void;
  } = $props();

  const NAMED = 5;

  const id = $props.id();
  const bytes = $derived(files.reduce((sum, file) => sum + file.size, 0));
  const more = $derived(files.length - NAMED);
  const count = $derived(
    files.length === 1 ? "1 file" : `${String(files.length)} files`,
  );

  function modal(dialog: HTMLDialogElement): () => void {
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-attach] button")?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }

  let answered = false;
  function answer(attach: boolean): void {
    if (answered) return;
    answered = true;
    onanswer(attach);
  }
</script>

<dialog
  {@attach modal}
  aria-label="Attach these files"
  aria-describedby="{id}-what"
  oncancel={(event) => {
    event.preventDefault();
    answer(false);
  }}
  onclose={() => answer(false)}
  onclick={(event) => {
    if (event.target === event.currentTarget) answer(false);
  }}
  class="m-auto w-[min(32rem,calc(100vw-2rem))] border border-ink bg-ground p-0 text-ink backdrop:bg-ground/70"
>
  <div class="px-3 py-2.5">
    <p id="{id}-what" class="wrap-anywhere">
      attach <strong class="font-semibold">{count}</strong>,
      <strong class="font-semibold">{sizeOf(bytes)}</strong>, to {quoted
        ? `“${to}”`
        : to}
    </p>
    <ul class="mt-2">
      {#each files.slice(0, NAMED) as file, at (at)}
        <li class="flex justify-between gap-x-4">
          <span class="min-w-0 truncate font-semibold">{file.name}</span>
          <span class="shrink-0">{sizeOf(file.size)}</span>
        </li>
      {/each}
    </ul>
    {#if more > 0}
      <p class="mt-1.5">and {more} more</p>
    {/if}
    {#if hidden > 0}
      <p class="mt-2">
        {hidden === 1
          ? "1 hidden file or folder"
          : `${String(hidden)} hidden files and folders`} left out
      </p>
    {/if}
  </div>
  <div
    class="flex items-baseline justify-between border-t border-ink px-3 leading-8"
  >
    <Action onclick={() => answer(false)}>cancel</Action>
    <span data-attach class="contents">
      <Action primary onclick={() => answer(true)}>attach</Action>
    </span>
  </div>
</dialog>
