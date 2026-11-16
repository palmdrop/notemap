<script lang="ts">
  import type { Item } from "@notemap/client";

  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import Box from "$components/primitives/blocks/Box.svelte";
  import type { Command } from "$lib/command/command";
  import { became, editable } from "$lib/lineage";
  import { notices } from "$lib/notices.svelte";

  import type { Editing } from "./editing.svelte";

  /**
   * The item's actions: Discard, Done and Route, docked at the foot on a
   * phone and at the head of its pane when wide. While editing they are
   * Attach, Cancel and Save. What a press just did is said on the line over
   * the bar, with Undo, rather than in a toast; a state that has a way back
   * keeps it in its box.
   */
  let {
    item,
    commands,
    editing,
  }: {
    item: Item;
    commands: readonly Command[];
    editing: Editing | undefined;
  } = $props();

  let picker = $state<HTMLInputElement | undefined>(undefined);

  const by = (id: string): Command | undefined =>
    commands.find((command) => command.id === id);

  function run(id: string): void {
    const found = by(id);
    if (found !== undefined && "run" in found) void found.run();
  }

  const discarded = $derived(item.archived !== undefined);
  const word = $derived(became(item));
  /** The feed's items are sealed; routing one again is a second decision. */
  const routed = $derived(item.routing !== undefined);

  /** What the bar just did to this item, while the line still says it. */
  const said = $derived.by(() => {
    const latest = notices.latest;
    return latest?.offer !== undefined ? latest : undefined;
  });

  function pick(event: Event): void {
    const files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
    if (picker !== undefined) picker.value = "";
    if (files.length > 0) editing?.pick(files);
  }
</script>

{#if discarded && editing === undefined}
  <div
    class="flex items-center gap-3 border-t border-rule bg-tag px-gutter py-2"
  >
    <span class="flex-1">Discarded</span>
    {#if by("undiscard") !== undefined}
      <Box icon="undo" onclick={() => run("undiscard")}>Undiscard</Box>
    {/if}
  </div>
{:else if word === "manual" && editing === undefined}
  <div
    class="flex items-center gap-3 border-t border-rule bg-tag px-gutter py-2"
  >
    <span class="flex-1">Manual: processed by hand</span>
  </div>
{/if}

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
          ><span class="flex-1"
            >{said.what}{#if said.subject !== undefined}
              <b>{said.subject}</b>{/if}</span
          ><button
            type="button"
            class="underline underline-offset-[0.2em]"
            onclick={() => notices.take(said.id)}>{said.offer?.label}</button
          ></span
        >{/if}{/snippet}
    {#if !discarded}
      <BarAction
        icon="trash"
        label="Discard"
        danger
        command="discard"
        disabled={by("discard")?.refusal !== undefined}
        onclick={() => run("discard")}
      />
    {/if}
    <BarAction
      icon="check"
      label="Done"
      command="manual"
      disabled={by("manual")?.refusal !== undefined}
      onclick={() => run("manual")}
    />
    <BarAction
      icon="route"
      label={routed ? "Route again" : "Route"}
      primary
      command="process"
      onclick={() => run("process")}
    />
  </ActionBar>
{/if}
