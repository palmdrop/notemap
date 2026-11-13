<script lang="ts">
  import type { PendingOperation } from "@notemap/client";

  import { itemHref } from "$components/item/href";
  import Band from "$components/primitives/blocks/Band.svelte";
  import Dot from "$components/primitives/marks/Dot.svelte";
  import Spinner from "$components/primitives/marks/Spinner.svelte";
  import Sheet from "$components/primitives/sheets/Sheet.svelte";
  import { publish } from "$lib/command/stack.svelte";
  import { left, offerOf, phaseOf, type Firing } from "$lib/firings.svelte";
  import { slide } from "$lib/motion";
  import type { Said } from "$lib/notices.svelte";
  import { outgoing } from "$lib/outgoing";
  import { NO_NOTICES } from "$lib/said";
  import type { RefusedCapture } from "$lib/refused";
  import { timeOf } from "$lib/stamp";

  import Entry from "./Entry.svelte";
  import Refused from "./Refused.svelte";
  import { PANEL } from "./panel.svelte";

  /**
   * The notices, as a sheet, or a panel at the right when wide: what is on its
   * way, what is waiting to send, the refused captures held here, and this
   * session's notices, newest first. What a notice offered is offered only
   * while it is live. Offline, nothing offers Cancel.
   */
  let {
    history,
    firings,
    now,
    unsent,
    refused = [],
    offline = false,
    onclose,
    ontake,
    oncancel,
    onforget,
    oncopy,
    onedit,
    ondelete,
  }: {
    history: readonly Said[];
    firings: readonly Firing[];
    now: number;
    unsent: readonly PendingOperation[];
    /** Captures the pool refused, held until somebody decides what becomes of them. */
    refused?: readonly RefusedCapture[];
    offline?: boolean;
    onclose: () => void;
    ontake: (id: string) => void;
    oncancel: (firing: Firing) => void;
    /** Lets go of what has gone. */
    onforget: () => void;
    oncopy?: (held: RefusedCapture) => void;
    onedit?: (held: RefusedCapture) => void;
    ondelete?: (held: RefusedCapture) => void;
  } = $props();

  publish(() => [{ id: "close", label: "close", run: onclose }], {
    atop: true,
  });

  const gone = $derived(history.some((said) => !said.live));
  const newest = $derived([...history].reverse());

  function at(ms: number): string {
    return timeOf(new Date(ms).toISOString());
  }

  const PHRASED = {
    window: "Routing by",
    sending: "Sending to",
    retrying: "Waiting for",
  } as const;
</script>

<Sheet title="notices" {onclose}>
  <section id={PANEL} aria-label="notices">
    {#if history.length === 0 && firings.length + unsent.length + refused.length === 0}
      <p class="px-gutter py-3 text-muted" transition:slide={{ fade: true }}>
        {NO_NOTICES}
      </p>
    {/if}

    {#if firings.length > 0}
      <Band level={3}>on its way</Band>
      <ol aria-label="on its way">
        {#each firings as firing (firing.record)}
          {@const seconds = left(firing, now)}
          {@const phase = phaseOf(firing, now)}
          {@const offered = offline ? undefined : offerOf(firing, now)}
          <Entry
            what={PHRASED[phase]}
            subject={phase === "window"
              ? firing.name
              : (firing.to ?? firing.name)}
            {...firing.where === undefined ? {} : { why: firing.where }}
            href={firing.href}
            {...offered === undefined
              ? {}
              : { offer: { label: "Cancel", take: () => oncancel(firing) } }}
          >
            {#snippet mark()}
              <Spinner />
              {#if seconds !== undefined}
                <span class="order-last text-muted tabular-nums"
                  >{seconds}s</span
                >
              {/if}
            {/snippet}
          </Entry>
        {/each}
      </ol>
    {/if}

    {#if unsent.length > 0}
      <Band level={3}>waiting to send</Band>
      <ol aria-label="waiting to send">
        {#each unsent as held (held.id)}
          {@const said = outgoing(held.operation)}
          <Entry
            when={timeOf(held.at)}
            what={said.what}
            subject={said.subject}
            href={said.item === undefined ? undefined : itemHref(said.item)}
          >
            {#snippet mark()}<Dot said="waiting to send" />{/snippet}
          </Entry>
        {/each}
      </ol>
    {/if}

    {#if refused.length > 0}
      <Band level={3}>refused</Band>
      <ol aria-label="refused">
        {#each refused as held (held.id)}
          <Refused
            {held}
            oncopy={() => oncopy?.(held)}
            onedit={() => onedit?.(held)}
            ondelete={() => ondelete?.(held)}
          />
        {/each}
      </ol>
    {/if}

    {#if history.length > 0}
      <Band level={3}>
        this session
        {#snippet end()}
          {#if gone}
            <button
              type="button"
              class="underline underline-offset-[0.2em]"
              onclick={onforget}>Clear</button
            >
          {/if}
        {/snippet}
      </Band>
    {/if}
    <!-- Drawn while empty too, so the last notice cleared slides out rather
         than going with the list. -->
    <ol aria-label="said" aria-hidden={history.length === 0 || undefined}>
      {#each newest as said (said.id)}
        <Entry
          when={at(said.at)}
          what={said.what}
          subject={said.subject}
          why={said.why}
          about={said.about}
          href={said.href}
          alarm={said.alarm === true}
          offer={said.live && said.offer !== undefined
            ? { label: said.offer.label, take: () => ontake(said.id) }
            : undefined}
        />
      {/each}
    </ol>
  </section>
</Sheet>
