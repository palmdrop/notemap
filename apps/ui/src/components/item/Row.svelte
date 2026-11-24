<script lang="ts">
  import type { BatchAction, Item } from "@notemap/client";

  import Edit from "$components/item/Edit.svelte";
  import EditFoot from "$components/item/EditFoot.svelte";
  import { Editing } from "$components/item/editing.svelte";
  import Payload from "$components/item/Payload.svelte";
  import Routing from "$components/item/Routing.svelte";
  import Tags from "$components/item/Tags.svelte";
  import Windowed from "$components/item/Windowed.svelte";
  import Box from "$components/primitives/blocks/Box.svelte";
  import Icon from "$components/primitives/icon/Icon.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Cached from "$components/primitives/marks/Cached.svelte";
  import Pending from "$components/primitives/marks/Pending.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import Became from "$components/primitives/marks/Became.svelte";
  import { goto } from "$app/navigation";

  import { itemHref } from "$components/item/href";
  import { width } from "$lib/breakpoint";
  import type { Firing } from "$lib/firings.svelte";
  import { NOT_DELIVERED, REJECTED } from "$lib/action-log";
  import { lastOpened } from "$lib/last-opened.svelte";
  import { modality } from "$lib/modality.svelte";
  import { notices } from "$lib/notices.svelte";
  import { became, editable } from "$lib/lineage";
  import {
    bringIntoView,
    fade,
    following,
    leave,
    settled,
    slide,
  } from "$lib/motion";
  import { pickedBy, type Picked } from "$lib/marking.svelte";
  import { noteHeld } from "$lib/held-hint.svelte";
  import { recordsOf } from "$lib/records.svelte";
  import { undrainedSince } from "$lib/undrained-since";

  /**
   * One row, on either register. The queue's says nothing about what became
   * of an item, every row on it being unrouted; the feed's says it in a word
   * where there is one, and in a line saying where it went.
   */
  let {
    item,
    selected,
    marked = false,
    cursor = false,
    marking = false,
    onbatch,
    offline,
    surface,
    filter = [],
    terms = [],
    pending = false,
    opens = false,
    cached = false,
    motion,
    foot = true,
    firing,
    onselect,
    onprocess,
  }: {
    item: Item;
    selected: boolean;
    /** Marked for a batch: its tags are every marked row's. */
    marked?: boolean;
    /** Where the keys are while rows are being marked. */
    cursor?: boolean;
    /** The surface is marking rows, and a row left out of it has its tags fixed. */
    marking?: boolean;
    /** What a marked row's tags are changed through. */
    onbatch?: (action: BatchAction) => void;
    offline: boolean;
    /** On the item's own surface, its records are drawn beneath the row rather than said in it. */
    surface: "queue" | "feed" | "item";
    /** The tags the surface is read through, marked where the row carries them. */
    filter?: readonly string[];
    /** The terms the surface is searched by, highlighted where the row's words hold them. */
    terms?: readonly string[];
    pending?: boolean;
    /** The first row under a heading, laying its top edge on the heading's rule. */
    opens?: boolean;
    /** Drawn from what this client holds rather than from the pool's answer. */
    cached?: boolean;
    /** Whether the list's latest change is one a read brought; absent, nothing moves. */
    motion?: { readonly still: boolean };
    /** Its route in its window, said on the row as on the line, with Cancel. */
    firing?: Firing | undefined;
    /** Whether a selected row draws its actions under it; the item view docks its own. */
    foot?: boolean;
    /** Absent where the row is the whole surface, and there is nothing to select it from. */
    onselect?: (how: Picked) => void;
    onprocess?: () => void;
  } = $props();

  const routed = $derived(surface !== "item");

  /**
   * The last delivery of this item the destination turned down, or the pool
   * gave up on, this session: on the queue the row says so in red.
   */
  const turned = $derived(
    surface === "queue"
      ? notices.history.findLast(
          (one) =>
            one.alarm === true &&
            one.href === itemHref(item.id) &&
            (one.what === REJECTED || one.what === NOT_DELIVERED),
        )
      : undefined,
  );

  let editing = $state<Editing | undefined>(undefined);
  let row = $state<HTMLElement | undefined>(undefined);
  let tags = $state<Tags | undefined>(undefined);

  /** The row has been on screen, once. */
  let shown = $state(false);

  function onScreen(element: HTMLElement) {
    if (surface !== "feed" || typeof IntersectionObserver === "undefined") {
      return;
    }
    const watching = new IntersectionObserver((seen) => {
      if (seen.some((one) => one.isIntersecting)) {
        shown = true;
        watching.disconnect();
      }
    });
    watching.observe(element);
    return () => watching.disconnect();
  }

  /** The pointer is over the row, where a marked row offers its `+`. */
  let pointed = $state(false);

  // Only where the item's summary says there is something to read: the
  // selected row, and on the feed a row once it has been on screen, whose
  // line keeps the end of the path it went to.
  const records = recordsOf(
    () => (item.routing === undefined ? undefined : item.id),
    () => routed && !offline && (selected || (surface === "feed" && shown)),
  );

  /** Read now or once it is on screen: either way, what they will say has its room. */
  const awaiting = $derived(
    item.routing !== undefined &&
      routed &&
      !offline &&
      (selected || surface === "feed") &&
      !records.settled,
  );

  // Every row on the queue is unrouted, and a word saying so on each says
  // nothing; one held from an earlier read that the pool no longer counts as
  // work still wears what became of it.
  const finished = $derived(
    surface !== "queue" ||
      item.archived !== undefined ||
      item.routing !== undefined ||
      item.revisedInto.length > 0,
  );
  const word = $derived(finished ? became(item) : undefined);
  /** A sealed item is edited by revising it, which the queue never does. */
  const mayEdit = $derived(
    editable(item) || (surface !== "queue" && item.archived === undefined),
  );

  // The box's foot is where `close` and `save` are, so a row that loses the
  // selection has no way out of the editable shape and must not be left in it.
  $effect(() => {
    if (!selected || !mayEdit) editing = undefined;
  });

  /** Opens the tag chooser, for the key that asks for it. */
  export function tag(): void {
    tags?.add();
  }

  /** Opens the capture's editable shape, for the key that asks for it. */
  export function edit(): void {
    if (mayEdit && editing === undefined) {
      editing = new Editing(item, () => (editing = undefined));
    }
  }

  /** Whether the capture is drawn as its field, for the surface deciding what a key reaches. */
  export function isEditing(): boolean {
    return editing !== undefined;
  }

  /**
   * A swipe left on a row opens the quick route, the row following the
   * finger. One that starts within the edge's 24px is the system's back
   * gesture, not the row's.
   */
  const EDGE = 24;
  const ENOUGH = 80;
  let swipe = $state<{ from: number; dx: number } | undefined>(undefined);
  const swipes = $derived(
    !width.wide && !marking && surface !== "item" && onprocess !== undefined,
  );

  /**
   * Holding a row selects it, and starts selecting: the first time a row is
   * held the list says so once. The press that follows the hold is not a tap.
   */
  const HOLD = 500;
  let holding: ReturnType<typeof setTimeout> | undefined;
  let held = false;

  function holdFrom(event: PointerEvent): void {
    // A finger or a pen has no ctrl and no hover, at any width.
    if (
      event.pointerType === "mouse" ||
      surface === "item" ||
      onselect === undefined
    )
      return;
    held = false;
    clearTimeout(holding);
    holding = setTimeout(() => {
      held = true;
      swipe = undefined;
      onselect?.({ toggle: true, range: false });
      noteHeld();
    }, HOLD);
  }

  function letGo(): void {
    clearTimeout(holding);
    holding = undefined;
  }

  function swipeFrom(event: PointerEvent): void {
    holdFrom(event);
    if (!swipes || event.pointerType === "mouse") return;
    const x = event.clientX;
    if (x < EDGE || x > window.innerWidth - EDGE) return;
    swipe = { from: x, dx: 0 };
  }

  function swipeAlong(event: PointerEvent): void {
    if (swipe === undefined) return;
    if (Math.abs(event.clientX - swipe.from) > 10) letGo();
    swipe = { ...swipe, dx: Math.min(0, event.clientX - swipe.from) };
  }

  function swipeEnd(): void {
    letGo();
    const went = swipe?.dx ?? 0;
    swipe = undefined;
    if (went <= -ENOUGH) onprocess?.();
  }

  /** The editable shape, for the bar that saves it. */
  export function editor(): Editing | undefined {
    return editing;
  }

  /**
   * A row being rewritten is not picked, nor processed, until that is left.
   * A tap or a click opens the item, full screen on a phone and beside the
   * list when wide; ctrl or shift selects instead. On the item a double tap
   * on the words edits it.
   */
  const picked = $derived(
    editing !== undefined
      ? undefined
      : !marking && surface !== "item"
        ? (how: Picked) => {
            if (how.toggle || how.range) onselect?.(how);
            else {
              lastOpened.set(item.id);
              void goto(itemHref(item.id));
            }
          }
        : onselect,
  );
  /** A tap that ends a hold has already done what the hold did. */
  const pick = $derived(
    picked === undefined
      ? undefined
      : (how: Picked) => {
          if (held) {
            held = false;
            return;
          }
          picked(how);
        },
  );
  const reach = $derived(
    editing !== undefined
      ? undefined
      : surface === "item"
        ? mayEdit
          ? edit
          : undefined
        : onprocess,
  );

  /** Brings the row into view, for the keys that walk the list. */
  export function reveal(): void {
    if (row !== undefined) bringIntoView(row, { headFirst: true });
  }

  // A file attached or removed grows or shrinks the row where it stands, which
  // can carry the row past either edge of the screen.
  let attached: number | undefined;
  $effect(() => {
    const count = editing?.attachments.length;
    const was = attached;
    attached = count;
    if (count === undefined || was === undefined || count === was) return;
    const moving = row?.parentElement;
    if (moving != null) {
      void settled(moving).then(() => {
        if (row !== undefined) bringIntoView(row);
      });
    }
  });
</script>

{#snippet facts()}
  {#if firing !== undefined}
    <Windowed {firing} {offline} />
  {:else if turned !== undefined}
    <!-- A delivery turned down after its window: the item is back, and says why. -->
    <p class="mt-2 flex items-start gap-2 text-small text-danger">
      <Icon name="route" class="mt-px size-4 flex-none" />
      <span
        >{turned.what} <b>{turned.subject}</b>{#if turned.why !== undefined}: {turned.why.replace(
            /,? ?back in the queue$/,
            "",
          )}{/if}</span
      >
    </p>
  {/if}
  {#if word !== undefined}
    <Became {word} />
  {/if}

  {#if cached}
    <Cached />
  {/if}

  {#if width.wide || (item.tags ?? []).length > 0 || editing !== undefined}
    <div>
      <Tags
        bind:this={tags}
        {item}
        {filter}
        {editing}
        addable={selected ||
          (marked && (cursor || pointed)) ||
          (pointed && width.wide && !marking && surface !== "item")}
        fixed={marking && !marked}
        onbatch={marked ? onbatch : undefined}
        stacked={false}
      />
    </div>
  {/if}

  <!-- A route takes no room in the queue: its window is said in its own box. -->
  {#if finished && routed && surface !== "queue"}
    <Routing
      summary={item.routing}
      records={records.all}
      {awaiting}
      onundone={() => records.reread()}
    />
  {/if}

  {#if records.refused !== ""}
    <div role="status" class="mt-2 text-danger">{records.refused}</div>
  {/if}
{/snippet}

<!-- One element on the register's own tracks, so the row has a height of its
     own and the columns stay in register with every other row: the outer box
     is what moves, the inner what its height follows. -->
<div
  class="col-span-full grid grid-cols-subgrid"
  in:slide={{ fade: true, still: motion?.still ?? true }}
  out:leave={{ still: motion?.still ?? true }}
  {@attach following}
>
  <!-- Where the pointer is decides whether a marked row offers its `+`, and,
       when wide, whether the row offers Route beside its words. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={row}
    data-row={item.id}
    {@attach onScreen}
    data-marked={marked ? "" : undefined}
    data-opens={opens ? "" : undefined}
    data-last-opened={surface !== "item" && lastOpened.id === item.id
      ? ""
      : undefined}
    data-headed=""
    onpointerenter={() => (pointed = true)}
    onpointerleave={() => (pointed = false)}
    onpointerdown={swipeFrom}
    onpointermove={swipeAlong}
    onpointerup={swipeEnd}
    onpointercancel={() => {
      swipe = undefined;
      letGo();
    }}
    style:translate={swipe === undefined || swipe.dx === 0
      ? undefined
      : `${String(swipe.dx)}px 0`}
    class="relative col-span-full grid min-h-row scroll-mt-held grid-cols-subgrid border-b border-rule {swipes
      ? 'touch-pan-y'
      : ''} transition-[background-color] duration-(--duration-short) ease-fade has-[[data-stamp]:focus-visible]:outline-2 has-[[data-stamp]:focus-visible]:-outline-offset-2 has-[[data-stamp]:focus-visible]:outline-ink {cursor &&
    modality.keys
      ? 'outline-1 -outline-offset-1 outline-ink'
      : ''} {marked
      ? 'bg-chosen'
      : surface !== 'item' && (selected || lastOpened.id === item.id)
        ? 'bg-picked'
        : pointed && width.wide && onprocess !== undefined
          ? 'bg-hover'
          : ''}"
  >
    <Rail {selected} {marked} {cursor} onpick={pick} onreach={reach}>
      <Stamp
        at={item.createdAt}
        dated={false}
        opened={selected}
        {marked}
        {marking}
        onopen={onselect === undefined
          ? undefined
          : (event) =>
              // When wide the time selects the row in place, for the keys
              // and the strip; anywhere else on it opens the item beside.
              width.wide
                ? onselect?.(pickedBy(event))
                : pick?.(pickedBy(event))}
      />
      {#if marking}
        <span class="mt-2 block" aria-hidden="true">
          <Icon
            name={marked ? "circle-check" : "circle"}
            class="size-6 {marked ? 'text-ink' : 'text-rule'}"
          />
        </span>
      {:else if pointed && width.wide && surface !== "item" && onselect !== undefined}
        <button
          type="button"
          title="Select (space)"
          aria-label="Select"
          class="mt-2 block"
          onclick={(event) => {
            event.stopPropagation();
            onselect?.({ toggle: true, range: false });
          }}
        >
          <Icon name="circle" class="size-6 text-rule" />
        </button>
      {/if}
    </Rail>

    {#snippet routeBeside()}
      {#if pointed && width.wide && !selected && !marking && reach !== undefined && surface === "queue"}
        <span transition:fade>
          <Box icon="route" title="Route (p)" onclick={reach}>Route</Box>
        </span>
      {/if}
    {/snippet}

    <Body
      {selected}
      onpick={pick}
      onreach={reach}
      aside={surface === "queue" && onprocess !== undefined
        ? routeBeside
        : undefined}
    >
      {#if editing !== undefined}
        <Edit {editing} />
      {:else}
        <Payload {item} {terms} />
      {/if}
      {@render facts()}
    </Body>

    {#if pending}
      <!-- The waiting dot, in the row's corner. -->
      <span class="absolute top-5 right-gutter leading-none">
        <Pending since={undrainedSince(item.id)} inline />
      </span>
    {/if}

    {#if selected && foot && editing !== undefined}
      <div
        data-foot
        class="col-span-full row-start-2 flex min-h-11 items-center border-t border-rule bg-off px-gutter"
        transition:fade
      >
        <EditFoot {editing} />
      </div>
    {/if}
  </div>
</div>
