<script lang="ts" generics="T">
  import type { Snippet } from "svelte";

  import { fade, rise } from "$lib/motion";

  /**
   * What needs an answer before anything else: losing changes, a delete that
   * loses something, a withdraw. Answers with the chosen way's value, or with
   * `undefined` when it is dismissed. The first way is the one that keeps
   * things as they are, and has the focus.
   */
  let {
    title,
    ways,
    onanswer,
    children,
  }: {
    title: string;
    ways: readonly {
      label: string;
      value: T;
      kind?: "primary" | "danger";
    }[];
    onanswer: (value: T | undefined) => void;
    children?: Snippet;
  } = $props();

  const id = $props.id();

  function modal(dialog: HTMLDialogElement): () => void {
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-way]")?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }

  let answered = false;
  function answer(value: T | undefined): void {
    if (answered) return;
    answered = true;
    onanswer(value);
  }
</script>

<dialog
  {@attach modal}
  aria-labelledby="{id}-title"
  aria-describedby="{id}-about"
  oncancel={(event) => {
    event.preventDefault();
    answer(undefined);
  }}
  onclose={() => answer(undefined)}
  class="fixed inset-x-0 top-[var(--visible-top,0px)] m-0 grid h-[var(--visible-height,100dvh)] max-h-none w-full max-w-none place-items-center bg-transparent p-gutter text-ink backdrop:bg-transparent"
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    transition:fade
    class="absolute inset-0 bg-veil"
    onclick={() => answer(undefined)}
  ></div>
  <section
    transition:rise
    class="relative w-full max-w-[22rem] rounded-control border border-edge bg-paper p-5"
  >
    <h2 id="{id}-title" class="mb-2 font-display text-title font-normal">
      {title}
    </h2>
    <div id="{id}-about" class="leading-[1.45]">{@render children?.()}</div>
    <div class="mt-5 flex flex-wrap justify-end gap-2">
      {#each ways as way, at (way.label)}
        <button
          type="button"
          data-way={at}
          onclick={() => answer(way.value)}
          class="inline-flex min-h-9 items-center rounded-control border px-3.5 whitespace-nowrap {way.kind ===
          'primary'
            ? 'border-ink bg-ink text-paper'
            : way.kind === 'danger'
              ? 'border-danger bg-danger text-paper'
              : 'border-off-line bg-off text-ink active:bg-off-down'}"
        >
          {way.label}
        </button>
      {/each}
    </div>
  </section>
</dialog>
