<script lang="ts">
  import { untrack } from "svelte";
  import type { BatchAction, Item } from "@notemap/client";

  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import Sheet from "$components/primitives/sheets/Sheet.svelte";
  import { client } from "$lib/client";
  import { notices } from "$lib/notices.svelte";
  import { triggeredBy } from "$lib/templates";
  import { TRIGGER_NAMESPACE } from "$lib/trigger";

  /**
   * Every tag the selected rows have or could have, each on all of them, on
   * some (a dash), or on none. A press puts a tag on all of them, again takes
   * it off all; nothing is sent until Apply, and Apply says so with Undo,
   * which puts every row's tags back as they were. Trigger tags are routed,
   * not tagged: the batch's Route is where they are.
   */
  let {
    marked,
    onclose,
  }: {
    marked: readonly Item[];
    onclose: () => void;
  } = $props();

  type Carried = "all" | "some" | "none";

  const inUse = client.tags.inUse;

  const has = (item: Item, name: string): boolean =>
    (item.tags ?? []).some((tag) => tag.name === name);

  function carried(name: string): Carried {
    const on = marked.filter((item) => has(item, name)).length;
    return on === 0 ? "none" : on === marked.length ? "all" : "some";
  }

  /** What each tag was when the sheet opened, which Apply and Undo are measured against. */
  const before = untrack(
    () =>
      new Map(
        [
          ...new Set([
            ...marked.flatMap((item) =>
              (item.tags ?? []).map((tag) => tag.name),
            ),
            ...$inUse.map((use) => use.name),
          ]),
        ]
          .filter((name) => triggeredBy(name) === undefined)
          .filter((name) => !name.startsWith(TRIGGER_NAMESPACE))
          .sort()
          .map((name) => [name, carried(name)] as const),
      ),
  );
  const items = untrack(() => [...marked]);

  let wanted = $state<Record<string, Carried>>(
    untrack(() => Object.fromEntries(before)),
  );
  let typed = $state("");

  const changed = $derived(
    Object.entries(wanted).filter(
      ([name, state]) => state !== (before.get(name) ?? "none"),
    ),
  );

  function press(name: string): void {
    wanted = { ...wanted, [name]: wanted[name] === "all" ? "none" : "all" };
  }

  /** One batch per tag and direction, sent only to the rows it changes. */
  async function send(
    plan: readonly { items: readonly string[]; action: BatchAction }[],
  ): Promise<void> {
    for (const one of plan) {
      if (one.items.length === 0) continue;
      await client.batch(one.items, one.action);
    }
  }

  async function apply(): Promise<void> {
    const plan = changed.map(([tag, state]) =>
      state === "all"
        ? {
            items: items
              .filter((item) => !has(item, tag))
              .map((item) => item.id),
            action: { kind: "tag", tag } as BatchAction,
          }
        : {
            items: items
              .filter((item) => has(item, tag))
              .map((item) => item.id),
            action: { kind: "untag", tag } as BatchAction,
          },
    );
    const undo = plan.map((one) => ({
      items: one.items,
      action: (one.action.kind === "tag"
        ? { kind: "untag", tag: one.action.tag }
        : {
            kind: "tag",
            tag: (one.action as { tag: string }).tag,
          }) as BatchAction,
    }));
    onclose();
    try {
      await send(plan);
      notices.raise({
        what: "Tagged",
        subject: `${String(items.length)} notes`,
        offer: {
          label: "Undo",
          take: () => {
            void send(undo).catch(() =>
              notices.raise({ what: "could not undo", alarm: true }),
            );
          },
        },
      });
    } catch {
      notices.raise({ what: "could not keep the batch", alarm: true });
    }
  }
</script>

<Sheet title="tag" {onclose}>
  <p class="m-0 px-gutter pt-3 text-small text-muted">
    {marked.length} selected
  </p>
  <form
    class="flex items-center gap-2 border-b border-rule px-gutter py-2"
    onsubmit={(event) => {
      event.preventDefault();
      const name = typed.trim().replace(/^#/, "");
      if (name === "") return;
      wanted = { ...wanted, [name]: "all" };
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
  <div class="flex flex-wrap gap-2 px-gutter py-3">
    {#each Object.entries(wanted) as [name, state] (name)}
      <button
        type="button"
        role="checkbox"
        aria-checked={state === "all"
          ? "true"
          : state === "some"
            ? "mixed"
            : "false"}
        onclick={() => press(name)}
        class="inline-flex min-h-9 items-center gap-1.5 rounded-control border px-3.5 {state ===
        'all'
          ? 'border-ink bg-ink text-paper'
          : 'border-off-line bg-off text-ink active:bg-off-down'}"
      >
        {#if state === "some"}<span aria-hidden="true">–</span>{/if}#{name}
      </button>
    {/each}
  </div>
  <p class="m-0 px-gutter pb-3 text-small text-muted">
    A tag on some of them is marked with a dash. Tap it to put it on all, again
    to take it off all.
  </p>
  <ActionBar at="foot" label="Tag">
    <BarAction icon="close" label="Cancel" onclick={onclose} />
    <BarAction
      icon="check"
      label="Apply"
      primary
      why={changed.length === 0 ? "Nothing changed yet." : undefined}
      onclick={() => void apply()}
    />
  </ActionBar>
</Sheet>
