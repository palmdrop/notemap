<script lang="ts">
  import type { Item } from "@notemap/client";

  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import Box from "$components/primitives/blocks/Box.svelte";
  import type { Command } from "$lib/command/command";
  import { notices } from "$lib/notices.svelte";
  import { trail } from "$lib/trail.svelte";

  import { itemHref } from "./href";

  import EditBar from "./EditBar.svelte";
  import type { Editing } from "./editing.svelte";

  /**
   * The item's actions: Discard, Manual and Route, docked at the foot of the
   * item's pane at every width. While editing they are
   * Attach, Cancel and Save. What a press just did is said on the line over
   * the bar, with Undo, rather than in a toast; a state that has a way back
   * keeps it in its box.
   */
  let {
    item,
    commands,
    editing,
    onundomanual,
  }: {
    item: Item;
    commands: readonly Command[];
    editing: Editing | undefined;
    /** Takes the manual mark back, where the item has one standing. */
    onundomanual?: () => void;
  } = $props();

  const by = (id: string): Command | undefined =>
    commands.find((command) => command.id === id);

  function run(id: string): void {
    const found = by(id);
    if (found !== undefined && "run" in found) void found.run();
  }

  const discarded = $derived(item.archived !== undefined);
  const manual = $derived(
    item.routing?.to.some((went) => went.kind === "user") === true,
  );
  /** The feed's items are sealed; routing one again is a second decision. */
  const routed = $derived(item.routing !== undefined);
  /** Manual and Discard are for work: a routed, marked or discarded item is past them. */
  const settled = $derived(discarded || routed);

  /**
   * What the decision that moved here did to the item it moved on from, while
   * the line still says it: Manual or Discard, with Undo.
   */
  const said = $derived.by(() => {
    const left = trail.left;
    const latest = notices.latest;
    return left !== undefined &&
      latest?.offer !== undefined &&
      latest.href === itemHref(left)
      ? latest
      : undefined;
  });

  const capital = (word: string): string =>
    word.charAt(0).toUpperCase() + word.slice(1);
</script>

{#snippet state()}
  {#if discarded && editing === undefined}
    <div
      class="flex items-center gap-3 border-t border-rule bg-tag px-gutter py-2"
    >
      <span class="flex-1">Discarded</span>
      {#if by("undiscard") !== undefined}
        <Box icon="undo" onclick={() => run("undiscard")}>Undiscard</Box>
      {/if}
    </div>
  {:else if manual && editing === undefined}
    <div
      class="flex items-center gap-3 border-t border-rule bg-tag px-gutter py-2"
    >
      <span class="flex-1">Manual: processed by hand</span>
      {#if onundomanual !== undefined}
        <Box icon="undo" onclick={onundomanual}>Undo</Box>
      {/if}
    </div>
  {/if}
{/snippet}

{@render state()}

{#if editing !== undefined}
  <EditBar {item} {editing} />
{:else}
  <ActionBar label="Item">
    {#snippet say()}{#if said !== undefined}<span
          class="flex items-center gap-3 text-ink"
          ><span class="min-w-0 flex-1 truncate"
            >{capital(
              said.what,
            )}{#if (said.about ?? said.subject) !== undefined}:
              <b>{said.about ?? said.subject}</b>{/if}</span
          ><button
            type="button"
            class="underline underline-offset-[0.2em]"
            onclick={() => notices.take(said.id)}
            >{capital(said.offer?.label ?? "")}</button
          ></span
        >{/if}{/snippet}
    {#if !settled}
      <BarAction
        icon="trash"
        label="Discard"
        danger
        command="discard"
        disabled={by("discard")?.refusal !== undefined}
        onclick={() => run("discard")}
      />
      <BarAction
        icon="check"
        label="Manual"
        command="manual"
        disabled={by("manual")?.refusal !== undefined}
        onclick={() => run("manual")}
      />
    {/if}
    <BarAction
      icon="route"
      label={routed ? "Route again" : "Route"}
      primary
      command="process"
      onclick={() => run("process")}
    />
  </ActionBar>
{/if}
