<script lang="ts">
  import { saidBy } from "@notemap/client";

  import {
    asksFirst,
    carriesFiles,
    droppedOf,
    foldersOf,
    isField,
    pastedFiles,
  } from "$lib/dropped";
  import { fade } from "$lib/motion";
  import { notices } from "$lib/notices.svelte";
  import { isReceiving, receiver, type Receiver } from "$lib/receiving.svelte";
  import { CEILING, walk, type Entry } from "$lib/walking";

  import Asking from "./Asking.svelte";

  /**
   * Files dragged over the page and pasted onto it, handed to whatever takes
   * them. A drop with nowhere to go is still taken from the browser, which
   * would otherwise open the file in place of the app and lose what the box
   * holds in memory.
   */

  /** Every element a drag has entered and not yet left; the window fires one pair per element crossed. */
  let entered = $state(0);
  const to = $derived(entered > 0 ? receiver() : undefined);

  /** The folder being read through, said while it is. */
  let reading = $state<string | undefined>(undefined);
  let asking = $state<
    | {
        readonly files: readonly File[];
        readonly hidden: number;
        readonly to: string;
        readonly answer: (attach: boolean) => void;
      }
    | undefined
  >(undefined);

  /** One arrival at a time: a drop made while another is read or asked about waits its turn. */
  let turn = Promise.resolve();

  function arrive(taker: Receiver, dropped: readonly (Entry | File)[]): void {
    // Caught so that one arrival going wrong never stops the ones after it.
    turn = turn
      .then(() => settle(taker, dropped))
      .catch((error: unknown) => {
        notices.raise({ what: saidBy(error), alarm: true });
      });
  }

  async function settle(
    taker: Receiver,
    dropped: readonly (Entry | File)[],
  ): Promise<void> {
    const folders = foldersOf(dropped);
    const what =
      folders.length === 1
        ? (folders[0]?.name ?? "")
        : `${String(folders.length)} folders`;

    if (folders.length > 0) reading = what;
    let walked;
    try {
      walked = await walk(dropped);
    } catch {
      notices.raise({ what: `${what}: could not be read`, alarm: true });
      return;
    } finally {
      reading = undefined;
    }

    const { files, hidden, over } = walked;
    if (over) {
      notices.raise({
        what: `${folders.length > 0 ? what : "what was dropped"}: more than ${String(CEILING)} files, nothing attached`,
        alarm: true,
      });
      return;
    }

    if (asksFirst(files)) {
      const attach = await new Promise<boolean>((answer) => {
        asking = { files, hidden, to: taker.name, answer };
      });
      asking = undefined;
      if (!attach) return;
    } else if (hidden > 0) {
      notices.raise({ what: `${leftOut(hidden)} left out of ${what}` });
    }

    if (files.length === 0) return;
    if (!isReceiving(taker)) {
      notices.raise({
        what: `${taker.name} was closed, nothing attached`,
        alarm: true,
      });
    } else if (taker.busy()) {
      notices.raise({
        what: `${taker.name} is being ${taker.edit ? "saved" : "sent"}, nothing attached`,
        alarm: true,
      });
    } else {
      taker.take(files);
    }
  }

  function leftOut(hidden: number): string {
    return hidden === 1
      ? "1 hidden file or folder"
      : `${String(hidden)} hidden files and folders`;
  }

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
    if (event.dataTransfer === null || !carried(event)) return;
    event.preventDefault();
    entered = 0;

    const taker = receiver();
    if (taker === undefined || taker.busy()) return;
    const dropped = droppedOf(event.dataTransfer);
    if (dropped.length > 0) arrive(taker, dropped);
  }

  function onpaste(event: ClipboardEvent): void {
    const taker = receiver();
    if (taker === undefined || taker.busy()) return;
    if (isField(event.target) && !taker.owns(event.target)) return;

    const files = pastedFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    arrive(taker, files);
  }
</script>

<svelte:window {ondragenter} {ondragleave} {ondragover} {ondrop} {onpaste} />

{#if to !== undefined || reading !== undefined}
  <div
    role="status"
    transition:fade
    class="pointer-events-none fixed inset-3 z-100 flex items-center justify-center border border-ink bg-ground/85 p-6 text-center"
  >
    <p class="max-w-[40ch] wrap-anywhere">
      {#if to === undefined}
        reading {reading}…
      {:else if to.busy()}
        {to.name} is being {to.edit ? "saved" : "sent"}
      {:else}
        <span class="font-bold">attach</span> to {to.name}
      {/if}
    </p>
  </div>
{/if}

{#if asking !== undefined}
  <Asking
    files={asking.files}
    hidden={asking.hidden}
    to={asking.to}
    onanswer={asking.answer}
  />
{/if}
