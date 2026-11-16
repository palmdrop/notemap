<script lang="ts">
  import { MAX_BATCH, type BatchAction, type Item } from "@notemap/client";

  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import { width } from "$lib/breakpoint";

  import BatchRoute from "./BatchRoute.svelte";
  import BatchTags from "./BatchTags.svelte";

  /**
   * What the selected rows can be given while any are selected: Discard (or
   * Undiscard where something selected is discarded), Tag and Route. Docked
   * at the foot on a phone, in the list's head when wide, under "n selected".
   */
  let {
    marked,
    full = false,
    onbatch,
    onall,
    onclear,
  }: {
    marked: readonly Item[];
    /** As many as one batch takes: nothing more is selected. */
    full?: boolean;
    onbatch: (action: BatchAction) => void;
    onall: () => void;
    onclear: () => void;
  } = $props();

  const discardable = $derived(
    marked.some((item) => item.archived === undefined),
  );
  const undiscardable = $derived(
    marked.some((item) => item.archived !== undefined),
  );

  let sheet = $state<"tag" | "route" | undefined>(undefined);
</script>

{#snippet bar()}
  <ActionBar label="Selected">
    {#snippet say()}<span class="flex items-center gap-3 text-ink"
        ><b class="flex-1">{marked.length} selected</b>{#if full}<span
            role="status"
            class="text-muted"
            >the most one batch takes is {String(MAX_BATCH)}</span
          >{/if}<button
          type="button"
          class="underline underline-offset-[0.2em]"
          onclick={onall}>All</button
        ><button
          type="button"
          class="underline underline-offset-[0.2em]"
          onclick={onclear}>Clear</button
        ></span
      >{/snippet}
    {#if discardable}
      <BarAction
        icon="trash"
        label="Discard"
        danger
        command="discard"
        onclick={() => onbatch({ kind: "archive" })}
      />
    {/if}
    {#if undiscardable}
      <BarAction
        icon="undo"
        label="Undiscard"
        command="undiscard"
        onclick={() => onbatch({ kind: "unarchive" })}
      />
    {/if}
    <BarAction
      icon="tag"
      label="Tag"
      command="tag"
      onclick={() => (sheet = "tag")}
    />
    <BarAction
      icon="route"
      label="Route"
      primary
      onclick={() => (sheet = "route")}
    />
  </ActionBar>
{/snippet}

{#if width.wide}
  <div class="w-full">{@render bar()}</div>
{:else}
  <div class="fixed inset-x-0 bottom-0 z-30">{@render bar()}</div>
{/if}

{#if sheet === "tag"}
  <BatchTags {marked} onclose={() => (sheet = undefined)} />
{:else if sheet === "route"}
  <BatchRoute
    count={marked.length}
    {onbatch}
    onclose={() => (sheet = undefined)}
  />
{/if}
