<script lang="ts">
  import Dot from "$components/primitives/marks/Dot.svelte";
  import Icon from "$components/primitives/icon/Icon.svelte";
  import { fade, fromSide } from "$lib/motion";

  import Glance from "./Glance.svelte";
  import Menu from "./Menu.svelte";
  import Reach from "./Reach.svelte";

  /**
   * Navigation on a phone, from the left over a veil: where to go, how much
   * is waiting to send, whether the pool answers and who this is.
   */
  let {
    current,
    queue,
    waiting,
    reachable,
    at,
    who,
    onclose,
  }: {
    current: string;
    queue: number | undefined;
    waiting: number;
    reachable: boolean;
    at: string | undefined;
    who: string;
    onclose: () => void;
  } = $props();

  function modal(dialog: HTMLDialogElement): () => void {
    dialog.showModal();
    dialog
      .querySelector<HTMLElement>("[aria-current=page]")
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
</script>

<dialog
  {@attach modal}
  aria-label="Menu"
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
    transition:fromSide={{ side: "left" }}
    class="absolute inset-y-0 left-0 flex w-[min(20rem,84%)] flex-col border-r border-rule bg-paper"
  >
    <header
      class="flex min-h-bar items-center justify-between border-b border-rule pr-1 pl-gutter"
    >
      <span class="font-display text-title">notemap</span>
      <button
        type="button"
        onclick={close}
        class="grid min-h-target min-w-target place-items-center"
      >
        <Icon name="close" label="Close" />
      </button>
    </header>
    <Menu {current} {queue} ongo={close} />
    <Glance />
    {#if waiting > 0}
      <p class="flex items-center gap-2 px-gutter py-2 text-small">
        <Dot said="waiting to send" />
        {waiting} waiting to send
      </p>
    {/if}
    <div class="mt-auto">
      <Reach {reachable} {at} {who} />
    </div>
  </section>
</dialog>
