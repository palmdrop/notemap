<script lang="ts">
  import { MAX_BATCH, type BatchAction, type Item } from "@notemap/client";

  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import { width } from "$lib/breakpoint";
  import { selects, type BatchDeed } from "$lib/selecting.svelte";

  import BatchRoute from "./BatchRoute.svelte";
  import BatchTags from "./BatchTags.svelte";

  /**
   * What the selected rows can be given while any are selected: Discard (or
   * Undiscard where something selected is discarded), Tag and Route. The
   * head says how many, with × and All; the deeds dock at the foot on a
   * phone and sit in the head when wide.
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

  const deeds = $derived<readonly BatchDeed[]>([
    ...(discardable
      ? [
          {
            id: "discard",
            icon: "trash" as const,
            label: "Discard",
            danger: true,
            run: () => onbatch({ kind: "archive" }),
          },
        ]
      : []),
    ...(undiscardable
      ? [
          {
            id: "undiscard",
            icon: "undo" as const,
            label: "Undiscard",
            run: () => onbatch({ kind: "unarchive" }),
          },
        ]
      : []),
    { id: "tag", icon: "tag", label: "Tag", run: () => (sheet = "tag") },
    {
      id: "route",
      icon: "route",
      label: "Route",
      primary: true,
      run: () => (sheet = "route"),
    },
  ]);

  selects(() => ({
    count: marked.length,
    full: full ? `the most one batch takes is ${String(MAX_BATCH)}` : undefined,
    all: onall,
    clear: onclear,
    deeds,
  }));
</script>

<!-- How many and the way out are the head's; on a phone the deeds dock at
     the foot, and when wide they sit in the head beside the count. -->
{#if !width.wide}
  <div class="fixed inset-x-0 bottom-0 z-30">
    <ActionBar label="Selected">
      {#each deeds as deed (deed.id)}
        <BarAction
          icon={deed.icon}
          label={deed.label}
          danger={deed.danger}
          primary={deed.primary}
          command={deed.id}
          onclick={deed.run}
        />
      {/each}
    </ActionBar>
  </div>
{/if}

{#if sheet === "tag"}
  <BatchTags {marked} {onbatch} onclose={() => (sheet = undefined)} />
{:else if sheet === "route"}
  <BatchRoute
    count={marked.length}
    {onbatch}
    onclose={() => (sheet = undefined)}
  />
{/if}
