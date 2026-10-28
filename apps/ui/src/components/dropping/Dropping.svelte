<script lang="ts">
  import { carriesFiles, isField, pastedFiles } from "$lib/dropped";
  import { fade } from "$lib/motion";
  import { receiver } from "$lib/receiving.svelte";

  /**
   * Files dragged over the page and pasted onto it, handed to whatever takes
   * them. A drop with nowhere to go is still taken from the browser, which
   * would otherwise open the file in place of the app and lose what the box
   * holds in memory.
   */

  /** Every element a drag has entered and not yet left; the window fires one pair per element crossed. */
  let entered = $state(0);
  const to = $derived(entered > 0 ? receiver() : undefined);

  function carried(event: DragEvent): boolean {
    return carriesFiles([...(event.dataTransfer?.types ?? [])]);
  }

  function ondragenter(event: DragEvent): void {
    if (carried(event)) entered += 1;
  }

  function ondragleave(event: DragEvent): void {
    if (carried(event)) entered = Math.max(0, entered - 1);
  }

  function ondragover(event: DragEvent): void {
    if (!carried(event)) return;
    event.preventDefault();
    const taker = receiver();
    if (event.dataTransfer !== null) {
      event.dataTransfer.dropEffect =
        taker === undefined || taker.busy() ? "none" : "copy";
    }
  }

  function ondrop(event: DragEvent): void {
    if (!carried(event)) return;
    event.preventDefault();
    entered = 0;

    const taker = receiver();
    if (taker === undefined || taker.busy()) return;
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) taker.take(files);
  }

  function onpaste(event: ClipboardEvent): void {
    const taker = receiver();
    if (taker === undefined || taker.busy()) return;
    if (isField(event.target) && !taker.owns(event.target)) return;

    const files = pastedFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    taker.take(files);
  }
</script>

<svelte:window {ondragenter} {ondragleave} {ondragover} {ondrop} {onpaste} />

{#if to !== undefined}
  <div
    role="status"
    transition:fade
    class="pointer-events-none fixed inset-3 z-100 flex items-center justify-center border border-ink bg-ground/85 p-6 text-center"
  >
    <p class="max-w-[40ch] wrap-anywhere">
      {#if to.busy()}
        {to.name} is being {to.edit ? "saved" : "sent"}
      {:else}
        <span class="font-bold">attach</span> to {to.name}
      {/if}
    </p>
  </div>
{/if}
