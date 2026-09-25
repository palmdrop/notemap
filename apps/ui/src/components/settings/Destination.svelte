<script lang="ts">
  import type { Snippet } from "svelte";

  import { saidBy } from "@notemap/client";
  import type {
    Destination,
    DestinationDescription,
    DestinationProbe,
  } from "@notemap/client";

  import Fact from "$components/settings/Fact.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import { pickable } from "$lib/pick";
  import { since } from "$lib/stamp";

  let {
    one,
    described,
    probed,
    checkedAt,
    asking,
    probing,
    opened,
    editing,
    offline,
    onopen,
    oncheck,
    onedit,
    onretire,
    ondelete,
    children,
  }: {
    one: Destination;
    described?: DestinationDescription;
    probed?: DestinationProbe;
    /** When either question last settled, for the facts grid's `checked …`. */
    checkedAt?: string;
    asking: boolean;
    probing: boolean;
    opened: boolean;
    /** The form is drawn below in its place; the row's own line and facts wait. */
    editing: boolean;
    offline: boolean;
    onopen: () => void;
    oncheck: () => void;
    onedit: () => void;
    onretire: () => Promise<unknown>;
    ondelete: () => Promise<unknown>;
    children?: Snippet;
  } = $props();

  const disabled = $derived(one.retired === true);

  const can = $derived(
    described === undefined
      ? undefined
      : described.kind === "described"
        ? described.capabilities.map((each) => each.name).join(", ")
        : undefined,
  );

  const refusing = $derived(
    described === undefined || described.kind === "described"
      ? undefined
      : `${described.kind} — ${described.detail}`,
  );

  /** `reached` reads `available`; `unusable` stays, since it is the bigger fact. */
  const PROBE_WORD: Partial<Record<DestinationProbe["kind"], string>> = {
    ready: "available",
    unreachable: "unavailable",
  };

  // A kind that cannot be probed is drawn as it was before probing existed.
  const reach = $derived.by(() => {
    if (probed === undefined || probed.kind === "not-offered") return undefined;
    if (probed.kind === "ready") {
      return { said: "available", alarm: false };
    }

    return {
      said: `${PROBE_WORD[probed.kind] ?? probed.kind} — ${probed.detail}`,
      alarm: probed.kind === "rejected",
    };
  });

  /** What the row leads with, collapsed and in the facts grid alike. */
  const status = $derived.by(
    (): { said: string; alarm: boolean; asking?: boolean } => {
      if (refusing !== undefined) return { said: refusing, alarm: true };
      if (reach !== undefined) return reach;
      if (asking || probing) return { said: "", alarm: false, asking: true };
      if (can !== undefined) return { said: "answered", alarm: false };
      if (disabled) return { said: "disabled", alarm: false };
      return { said: "not asked yet", alarm: false };
    },
  );

  const since_ = $derived(
    checkedAt === undefined ? undefined : since(checkedAt),
  );

  let busy = $state(false);
  let retireFailed = $state("");
  let asked = $state(false);
  let refusal = $state<string | undefined>(undefined);

  async function toggleRetire() {
    busy = true;
    retireFailed = "";
    try {
      await onretire();
    } catch (error) {
      retireFailed = saidBy(error);
    } finally {
      busy = false;
    }
  }

  async function confirmDelete() {
    busy = true;
    try {
      await ondelete();
    } catch (error) {
      refusal = saidBy(error);
    } finally {
      busy = false;
    }
  }

  function cancelAsk() {
    asked = false;
    refusal = undefined;
  }

  // A row with a form or an ask open closes only through them — `cancel`,
  // `save`, `keep` — or when another row is opened; a click inside it is not
  // a way out that throws away what was typed.
  function pick() {
    if (editing || asked) return;
    onopen();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="py-4 {opened
    ? '-mx-3 -mt-px border border-ink px-3 max-narrow:-mx-2 max-narrow:px-2'
    : 'border-b border-b-ink'}"
  onclick={pickable(pick)}
>
  <div class="flex cursor-pointer flex-wrap items-baseline gap-x-3">
    <button
      type="button"
      onclick={pick}
      aria-expanded={opened}
      class="font-semibold hover:underline"
    >
      {one.name}
    </button>
    <span>{one.kind}</span>

    <span
      class="ml-auto whitespace-nowrap max-narrow:ml-0 max-narrow:w-full {status.alarm
        ? 'text-alarm'
        : ''}"
    >
      {#if status.asking === true}
        <Asking subject={one.name} />
      {:else}
        {status.said}
      {/if}
    </span>
  </div>

  {#if opened && !editing}
    <div class="mt-4">
      <Fact name="actions">
        {#if can !== undefined}
          {can}
        {:else if asking}
          <Asking />
        {:else}
          {disabled ? "not offered, so not asked" : "unasked"}
        {/if}
      </Fact>
      <Fact name="status">
        {#if status.asking === true}
          <Asking />
        {:else}
          {status.said}{since_ === undefined ? "" : ` · checked ${since_}`}
        {/if}
      </Fact>
      {#each Object.entries(one.settings ?? {}) as [key, value] (key)}
        <Fact name={key}>{String(value)}</Fact>
      {/each}

      {#if asked}
        <div
          class="mt-3 flex flex-wrap items-baseline gap-x-6 border-t border-t-ink pt-3 text-alarm"
        >
          {#if refusal !== undefined}
            <span>{refusal}</span>
            <Action
              working={busy}
              onclick={() => void toggleRetire().then(() => (asked = false))}
            >
              disable instead
            </Action>
          {:else}
            <span>Delete {one.name}?</span>
            <Action working={busy} onclick={() => void confirmDelete()}>
              delete
            </Action>
          {/if}
          <Action onclick={cancelAsk}>keep</Action>
        </div>
      {:else}
        <div
          class="mt-3 flex flex-wrap items-baseline gap-x-6 border-t border-t-ink pt-3"
        >
          <Action disabled={asking || probing} onclick={oncheck}>
            check again
          </Action>
          <Action disabled={offline} onclick={onedit}>edit</Action>
          <Action
            disabled={offline}
            working={busy}
            onclick={() => void toggleRetire()}
          >
            {disabled ? "enable" : "disable"}
          </Action>
          {#if retireFailed !== ""}
            <span class="text-alarm">{retireFailed}</span>
          {/if}
          <span class="ml-auto max-narrow:ml-0">
            <Action alarm disabled={offline} onclick={() => (asked = true)}>
              delete
            </Action>
          </span>
        </div>
      {/if}
    </div>
  {/if}

  {#if opened}
    {@render children?.()}
  {/if}
</div>
