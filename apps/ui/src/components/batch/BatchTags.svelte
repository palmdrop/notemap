<script lang="ts">
  import type { BatchAction, Item } from "@notemap/client";

  import Icon from "$components/primitives/icon/Icon.svelte";
  import Sheet from "$components/primitives/sheets/Sheet.svelte";
  import { client } from "$lib/client";
  import { triggeredBy } from "$lib/templates";
  import { TRIGGER_NAMESPACE } from "$lib/trigger";

  /**
   * Every tag the selected rows have or could have, each on all of them, on
   * some (a dash), or on none. A press puts a tag on every row, or takes one
   * that all of them carry off them all. Trigger tags are routed, not tagged:
   * the batch's Route is where they are.
   */
  let {
    marked,
    onbatch,
    onclose,
  }: {
    marked: readonly Item[];
    onbatch: (action: BatchAction) => void;
    onclose: () => void;
  } = $props();

  const inUse = client.tags.inUse;

  const names = $derived(
    [
      ...new Set([
        ...marked.flatMap((item) => (item.tags ?? []).map((tag) => tag.name)),
        ...$inUse.map((use) => use.name),
      ]),
    ]
      .filter((name) => triggeredBy(name) === undefined)
      .filter((name) => !name.startsWith(TRIGGER_NAMESPACE))
      .sort(),
  );

  function carried(name: string): "all" | "some" | "none" {
    const on = marked.filter((item) =>
      (item.tags ?? []).some((tag) => tag.name === name),
    ).length;
    return on === 0 ? "none" : on === marked.length ? "all" : "some";
  }

  let typed = $state("");
</script>

<Sheet title="tag" {onclose}>
  <form
    class="flex items-center gap-2 border-b border-rule px-gutter py-2"
    onsubmit={(event) => {
      event.preventDefault();
      const name = typed.trim();
      if (name === "") return;
      onbatch({ kind: "tag", tag: name });
      typed = "";
    }}
  >
    <input
      bind:value={typed}
      aria-label="A new tag for every selected note"
      placeholder="A new tag"
      class="min-h-9 min-w-0 flex-1 bg-transparent outline-none"
    />
  </form>
  <ul class="m-0 list-none p-0">
    {#each names as name (name)}
      {@const state = carried(name)}
      <li>
        <button
          type="button"
          role="checkbox"
          aria-checked={state === "all"
            ? "true"
            : state === "some"
              ? "mixed"
              : "false"}
          onclick={() =>
            onbatch(
              state === "all"
                ? { kind: "untag", tag: name }
                : { kind: "tag", tag: name },
            )}
          class="flex min-h-target w-full items-center justify-between border-b border-rule px-gutter text-left"
        >
          <span>#{name}</span>
          <span
            aria-hidden="true"
            class="grid size-5 place-items-center rounded-tag border {state ===
            'none'
              ? 'border-rule'
              : 'border-ink bg-ink text-paper'}"
          >
            {#if state === "all"}<Icon
                name="check"
                class="size-4"
              />{:else if state === "some"}–{/if}
          </span>
        </button>
      </li>
    {/each}
  </ul>
</Sheet>
