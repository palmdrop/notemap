<script lang="ts">
  import { onDestroy } from "svelte";

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
  import {
    isReceiving,
    owner,
    receiver,
    type Receiver,
  } from "$lib/receiving.svelte";
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
  /** A dialog was open as the drag went over. */
  let shut = $state(false);
  const to = $derived(entered > 0 && !shut ? receiver() : undefined);

  /** The folder being read through, said while it is. */
  let reading = $state<string | undefined>(undefined);
  let asking = $state<
    | {
        readonly files: readonly File[];
        readonly hidden: number;
        readonly to: string;
        readonly quoted: boolean;
        readonly answer: (attach: boolean) => void;
      }
    | undefined
  >(undefined);

  /** One arrival at a time: a drop made while a folder is being read waits its turn. */
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
    const [first] = folders.length > 0 ? folders : dropped;
    const what =
      folders.length > 1
        ? `${String(folders.length)} folders`
        : folders.length === 1 || dropped.length === 1
          ? (first?.name ?? "")
          : "what was dropped";

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
        what: `${what}: more than ${String(CEILING)} files, nothing attached`,
        alarm: true,
      });
      return;
    }

    if (asksFirst(files)) {
      const attach = await new Promise<boolean>((answer) => {
        asking = {
          files,
          hidden,
          to: taker.name,
          quoted: taker.edit,
          answer,
        };
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

  /**
   * A drag that started on the page: a browser marks a dragged picture as
   * carrying files, and the shell's own thumbnails are pictures.
   */
  let fromHere = false;

  function carried(event: DragEvent): boolean {
    return !fromHere && carriesFiles([...(event.dataTransfer?.types ?? [])]);
  }

  /** While a dialog is open nothing arrives, as no key reaches past one. */
  function barred(): boolean {
    return document.querySelector("dialog[open]") !== null;
  }

  /**
   * A drag over the page is told so several times a second. Gone quiet, it
   * has left, though the leave was lost with an element removed under it.
   */
  const QUIET = 1000;
  let quiet: ReturnType<typeof setTimeout> | undefined;

  function heard(): void {
    clearTimeout(quiet);
    quiet = setTimeout(() => {
      entered = 0;
    }, QUIET);
  }

  function done(): void {
    clearTimeout(quiet);
    entered = 0;
  }

  onDestroy(() => {
    clearTimeout(quiet);
  });

  function ondragstart(): void {
    fromHere = true;
  }

  // A pointer moving means no drag is under way, which covers a drag whose
  // end was lost with the element it started from.
  function ondragend(): void {
    fromHere = false;
  }

  function ondragenter(event: DragEvent): void {
    if (!carried(event)) return;
    entered += 1;
    shut = barred();
    heard();
  }

  function ondragleave(event: DragEvent): void {
    if (!carried(event)) return;
    entered = Math.max(0, entered - 1);
    if (entered === 0) done();
  }

  function ondragover(event: DragEvent): void {
    if (!carried(event)) return;
    event.preventDefault();
    shut = barred();
    heard();
    const taker = receiver();
    if (event.dataTransfer !== null) {
      event.dataTransfer.dropEffect =
        shut || taker === undefined || taker.busy() ? "none" : "copy";
    }
  }

  function ondrop(event: DragEvent): void {
    if (event.dataTransfer === null || !carried(event)) return;
    event.preventDefault();
    done();

    const taker = receiver();
    if (barred() || taker === undefined || taker.busy()) return;
    const dropped = droppedOf(event.dataTransfer);
    if (dropped.length > 0) arrive(taker, dropped);
  }

  function onpaste(event: ClipboardEvent): void {
    if (barred()) return;
    const taker =
      owner(event.target) ?? (isField(event.target) ? undefined : receiver());
    if (taker === undefined || taker.busy()) return;

    const files = pastedFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    arrive(taker, files);
  }
</script>

<svelte:window
  {ondragstart}
  {ondragend}
  onpointermove={ondragend}
  {ondragenter}
  {ondragleave}
  {ondragover}
  {ondrop}
  {onpaste}
/>

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
    quoted={asking.quoted}
    onanswer={asking.answer}
  />
{/if}
