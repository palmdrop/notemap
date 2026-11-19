<script lang="ts">
  import type { Item } from "@notemap/client";

  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import Box from "$components/primitives/blocks/Box.svelte";
  import type { Command } from "$lib/command/command";
  import { editable } from "$lib/lineage";
  import { notices } from "$lib/notices.svelte";

  import type { Editing } from "./editing.svelte";

  /**
   * The item's actions: Discard, Done and Route, docked at the foot of the
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

  let picker = $state<HTMLInputElement | undefined>(undefined);

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
  /** Done and Discard are for work: a routed, marked or discarded item is past them. */
  const settled = $derived(discarded || routed);

  /** What a press just did, while the line still says it: Done or Discard, with Undo. */
  const said = $derived.by(() => {
    const latest = notices.latest;
    return latest?.offer !== undefined ? latest : undefined;
  });

  const WORDS: Readonly<Record<string, string>> = {
    discarded: "Discarded",
    "marked manual": "Done",
  };
  const capital = (word: string): string =>
    word.charAt(0).toUpperCase() + word.slice(1);

  function pick(event: Event): void {
    const files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
    if (picker !== undefined) picker.value = "";
    if (files.length > 0) editing?.pick(files);
  }
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
  <ActionBar label="Editing">
    {#snippet say()}{#if !editable(item)}Sealed: saving makes a revision, and
        what was routed stays as it was.{/if}{/snippet}
    <BarAction
      icon="attach"
      label="Attach"
      disabled={editing.busy}
      onclick={() => picker?.click()}
    />
    <BarAction
      icon="close"
      label="Cancel"
      command="close"
      onclick={() => editing?.close()}
    />
    <BarAction
      icon="check"
      label="Save"
      primary
      working={editing.busy}
      command="save"
      onclick={() => void editing?.save()}
    />
  </ActionBar>
  <input
    bind:this={picker}
    type="file"
    multiple
    onchange={pick}
    aria-label="Files to carry"
    class="hidden"
  />
{:else}
  <ActionBar label="Item">
    {#snippet say()}{#if said !== undefined}<span
          class="flex items-center gap-3 text-ink"
          ><span class="min-w-0 flex-1 truncate"
            >{WORDS[said.what] ??
              capital(
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
        label="Done"
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
