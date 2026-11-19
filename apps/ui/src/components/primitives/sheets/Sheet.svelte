<script lang="ts">
  import type { Snippet } from "svelte";

  import { width } from "$lib/breakpoint";
  import { fade, fromFoot, fromSide, rise } from "$lib/motion";
  import Icon from "$components/primitives/icon/Icon.svelte";

  /**
   * A sheet rising from the foot over a veil, on a phone. When wide it is a
   * panel at the right, or a dialog in the middle for a quick choice. Closed
   * by its ×, by `esc`, and by a press on the veil; `onclose` is told once
   * and the caller removes it.
   */
  let {
    title,
    wide = "panel",
    onclose,
    children,
    foot,
  }: {
    title: string;
    wide?: "panel" | "dialog";
    onclose: () => void;
    children: Snippet;
    /** A bar docked at the sheet's foot: Reset and Show, Apply. */
    foot?: Snippet;
  } = $props();

  const id = $props.id();

  const form = $derived(width.wide ? wide : "sheet");

  // Focused without scrolling: the panel is still off the edge as it slides
  // in, and the dialog scrolling to the focus is what made it overshoot and
  // jump back.
  function modal(dialog: HTMLDialogElement): () => void {
    dialog.showModal();
    dialog
      .querySelector<HTMLElement>("section")
      ?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
    };
  }

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    onclose();
  }

  const placed = $derived(
    form === "sheet"
      ? "inset-x-0 bottom-0 max-h-[85dvh] border-t"
      : form === "panel"
        ? "inset-y-0 right-0 w-[min(var(--spacing-panel),100vw)] border-l"
        : "top-[12vh] left-1/2 max-h-[76vh] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[0.75rem] border",
  );

  function moving(node: Element) {
    return form === "sheet"
      ? fromFoot(node)
      : form === "panel"
        ? fromSide(node, { side: "right" })
        : rise(node);
  }
</script>

<dialog
  {@attach modal}
  aria-labelledby="{id}-title"
  data-sheet={form}
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
  onclose={close}
  class="fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden bg-transparent p-0 text-ink backdrop:bg-transparent"
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div transition:fade class="absolute inset-0 bg-veil" onclick={close}></div>
  <section
    tabindex="-1"
    transition:moving
    class="absolute flex flex-col overflow-y-auto border-rule bg-paper outline-none {placed}"
  >
    <header
      class="flex min-h-bar items-center justify-between border-b border-rule pr-1 pl-gutter"
    >
      <h2 id="{id}-title" class="font-display text-title font-normal">
        {title}
      </h2>
      <button
        type="button"
        onclick={close}
        class="grid min-h-target min-w-target place-items-center"
      >
        <Icon name="close" label="Close" />
      </button>
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto">
      {@render children()}
    </div>
    {#if foot !== undefined}
      {@render foot()}
    {/if}
  </section>
</dialog>
