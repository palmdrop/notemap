<script lang="ts">
  import { afterNavigate, goto } from "$app/navigation";

  import Icon from "$components/primitives/icon/Icon.svelte";
  import { width } from "$lib/breakpoint";
  import { client } from "$lib/client";
  import { commandOf, publish } from "$lib/command/stack.svelte";
  import { timeOf, weekdayOf } from "$lib/stamp";

  import { itemHref } from "./href";
  import Morph from "./Morph.svelte";
  import { walkOf } from "./walk.svelte";

  /**
   * The item's own header: back on a phone and close when wide, its day and
   * time, where it stands in its list, Previous and Next in the morph shape,
   * and the ⋯ menu holding Edit, Copy and History.
   */
  let { id }: { id: string } = $props();

  const held = $derived(client.held(id));
  const item = $derived($held);
  const walk = walkOf(() => id);
  const at = $derived(walk.at);
  const previous = $derived(walk.previous);
  const next = $derived(walk.next);

  let menu = $state(false);

  /** Whether the item was reached from inside the shell, so going back stays in it. */
  let within = false;
  afterNavigate(({ from, type }) => {
    if (type !== "enter" && from !== null) within = true;
  });

  function back(): void {
    if (within) history.back();
    else void goto(walk.home);
  }

  function step(to: { id: string } | undefined): void {
    if (to !== undefined) void goto(itemHref(to.id), { replaceState: true });
  }

  publish(() => [
    { id: "back", label: "back", run: back },
    {
      id: "previous",
      label: "previous",
      refusal: previous === undefined ? "the first" : undefined,
      run: () => step(previous),
    },
    {
      id: "next",
      label: "next",
      refusal: next === undefined ? "the last" : undefined,
      run: () => step(next),
    },
  ]);

  const MENU = [
    { id: "edit", label: "Edit", icon: "edit" },
    { id: "copy", label: "Copy", icon: "copy" },
    { id: "open", label: "History", icon: "log" },
  ] as const;

  const offered = $derived(
    MENU.map((one) => ({ ...one, command: commandOf(one.id) })).filter(
      (one) => one.command !== undefined,
    ),
  );

  function take(found: (typeof offered)[number]): void {
    menu = false;
    const command = found.command;
    if (command === undefined) return;
    if ("run" in command) void command.run();
    else void goto(command.href);
  }
</script>

<header
  class="sticky top-0 z-30 flex min-h-bar items-center gap-2 border-b border-rule bg-paper pr-1 pl-1"
>
  <button
    type="button"
    onclick={back}
    title="Back (Esc)"
    class="grid min-h-target min-w-target place-items-center"
  >
    <Icon
      name={width.wide ? "close" : "back"}
      label={width.wide ? "Close" : "Back"}
    />
  </button>
  {#if item !== undefined}
    <h1 class="flex min-w-0 items-baseline gap-2 truncate">
      <span class="font-display text-weekday lowercase"
        >{weekdayOf(item.createdAt)}</span
      >
      <span class="tabular-nums">{timeOf(item.createdAt)}</span>
    </h1>
  {/if}

  <div class="ml-auto flex items-center gap-2">
    {#if at !== -1}
      <span class="text-small text-muted tabular-nums"
        >{at + 1}/{walk.items.length}</span
      >
      <Morph
        onprevious={previous === undefined ? undefined : () => step(previous)}
        onnext={next === undefined ? undefined : () => step(next)}
      />
    {/if}

    <span class="relative">
      <button
        type="button"
        aria-expanded={menu}
        aria-haspopup="menu"
        onclick={() => (menu = !menu)}
        class="grid min-h-target min-w-target place-items-center"
      >
        <Icon name="more" label="More" />
      </button>
      {#if menu}
        <div
          role="menu"
          class="absolute top-full right-0 z-40 min-w-44 rounded-control border border-rule bg-paper py-1"
        >
          {#each offered as one (one.id)}
            <button
              type="button"
              role="menuitem"
              onclick={() => take(one)}
              class="flex min-h-target w-full items-center gap-3 px-gutter text-left hover:bg-band"
            >
              <Icon name={one.icon} class="size-5" />
              {one.label}
            </button>
          {/each}
        </div>
      {/if}
    </span>
  </div>
</header>
