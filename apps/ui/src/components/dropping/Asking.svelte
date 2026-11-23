<script lang="ts">
  import Dialog from "$components/primitives/sheets/Dialog.svelte";
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

  const bytes = $derived(files.reduce((sum, file) => sum + file.size, 0));
  const more = $derived(files.length - NAMED);
  const count = $derived(
    files.length === 1 ? "1 file" : `${String(files.length)} files`,
  );
</script>

<Dialog
  title="Attach these files?"
  ways={[
    { label: "Cancel", value: false },
    { label: "Attach", value: true, kind: "primary" },
  ]}
  onanswer={(attach) => onanswer(attach === true)}
>
  <p class="m-0 wrap-anywhere">
    <strong class="font-semibold">{count}</strong>,
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
</Dialog>
