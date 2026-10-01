<script lang="ts">
  import { untrack } from "svelte";

  import type { Action, PendingOperation } from "@notemap/client";

  import { itemHref } from "$components/item/href";
  import Line from "$components/primitives/frame/Line.svelte";
  import { SHOWN_AFTER } from "$components/primitives/marks/Asking.svelte";
  import { firingOf, noticeOf } from "$lib/action-log";
  import { client } from "$lib/client";
  import { publish } from "$lib/command/stack.svelte";
  import { nameOf } from "$lib/destinations";
  import { aboutItem } from "$lib/excerpt";
  import { cancelRouting, recheckFirings } from "$lib/firing";
  import { firings, type Firing } from "$lib/firings.svelte";
  import { notices } from "$lib/notices.svelte";
  import { outgoing } from "$lib/outgoing";
  import { reachable } from "$lib/reachable.svelte";
  import { discardedKey, keyFor } from "$lib/routing";
  import { heldName } from "$lib/templates";

  import Counts from "./Counts.svelte";
  import FiringSegment from "./Firing.svelte";
  import Message from "./Message.svelte";
  import Panel from "./Panel.svelte";

  /** Signed out: the pool's work has left with the session, and the device's own has not. */
  let { shut = false }: { shut?: boolean } = $props();

  const pool = reachable();
  const outbox = client.outbox;
  const queue = client.counts.queue;

  let open = $state(false);
  let line = $state<HTMLElement | undefined>(undefined);

  const refused = $derived($outbox.filter((held) => held.state === "refused"));
  const unsent = $derived($outbox.filter((held) => held.state !== "refused"));

  /**
   * Work is counted once it has waited as long as the asking mark does, as a
   * row's own mark is: most of it drains before then, and a count that came
   * and went would say nothing but move the line.
   */
  let clock = $state(Date.now());
  const waited = $derived(
    unsent.filter((held) => clock - Date.parse(held.at) >= SHOWN_AFTER),
  );

  $effect(() => {
    const due = unsent
      .map((held) => Date.parse(held.at) + SHOWN_AFTER)
      .filter((at) => at > clock);
    if (due.length === 0) return;
    const timer = setTimeout(
      () => (clock = Date.now()),
      Math.min(...due) - Date.now(),
    );
    return () => clearTimeout(timer);
  });

  function toggle(): void {
    open = !open;
  }

  // Opening the panel is seeing what went wrong: nothing else has to clear it.
  $effect(() => {
    if (open) untrack(() => notices.seen());
  });

  /**
   * A refusal is said once, as a notice, and then the client lets go of it:
   * the panel is where it is read again, and holding it in the outbox would
   * ask somebody to clear it.
   */
  function said(held: PendingOperation): void {
    const deed = outgoing(held.operation).what;
    notices.raise({
      what: `${deed.split(" · ")[0] ?? deed} refused${
        held.failure === undefined ? "" : `: ${held.failure}`
      }`,
      why: deed,
      alarm: true,
      key: `refused:${held.id}`,
    });
    void client.dismiss(held.id);
  }

  $effect(() => {
    if (shut) return;
    for (const held of refused) untrack(() => said(held));
  });

  function cancel(firing: Firing): void {
    cancelRouting(firing.record, firing.item, firing.name);
  }

  publish(() => [
    { id: "notices", label: open ? "close notices" : "notices", run: toggle },
  ]);

  // A press anywhere but the line or its panel puts the panel away.
  $effect(() => {
    if (!open) return;

    const away = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && line?.contains(target) === true) return;
      open = false;
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  });

  /**
   * Which capture a log entry was about. The log names an id, and an id is the
   * one thing nobody can recognise a note by — so the item is read for it. The
   * notice is worth saying without one, which is why this cannot fail loudly.
   */
  async function whichCapture(item: string | undefined) {
    if (item === undefined) return undefined;

    try {
      const { item: held } = await client.item(item);
      return held === undefined ? undefined : aboutItem(held);
    } catch {
      return undefined;
    }
  }

  /**
   * A read that could not reach back to the mark is a person who has been away,
   * and a page of failures is not a report of it. They are counted and left in
   * the log, which is where a day's worth belongs, and the newest count takes
   * the place of the last.
   */
  function tooMuch(since: number) {
    notices.raise({
      what: `${String(since)} or more things happened`,
      why: "while this was away",
      href: "/log",
      alarm: true,
      only: "missed",
    });
  }

  /**
   * Taken back on another device, or here before the log said so: an `undo`
   * still on the line would refuse, so it goes.
   */
  function settle(action: Action): void {
    const record = (action.detail as Record<string, unknown>)["record"];
    if (action.kind === "delivery-cancelled" && typeof record === "string") {
      notices.settled(keyFor(record));
    }
    if (action.kind === "unarchived" && action.subject !== undefined) {
      notices.settled(discardedKey(action.subject));
    }
  }

  /** What an entry does to the offers and the routes in flight, said or not. */
  function follow(action: Action): void {
    settle(action);

    const firing = firingOf(action, {
      templateOf: heldName,
      about: itemHref,
    });
    if (firing === undefined) return;
    if ("opened" in firing) firings.opened(firing.opened);
    else firings.closed(firing.closed);
  }

  async function hear(actions: readonly Action[]) {
    for (const action of actions) {
      follow(action);

      const raised = noticeOf(action, {
        nameOf,
        templateOf: heldName,
        about: itemHref,
      });
      if (raised === undefined) continue;

      const about = await whichCapture(action.subject);
      notices.raise(about === undefined ? raised : { ...raised, about });
    }
  }

  // What happened while nobody was asking. The status line is the only reader
  // of it, so the watcher is started by the thing that says what it answers.
  $effect(() => {
    if (shut) return;

    const held = client.actions.watch().subscribe((since) => {
      if (since.more) {
        for (const action of since.actions) follow(action);
        void recheckFirings();
        tooMuch(since.actions.length);
        return;
      }

      void hear(since.actions);
    });

    return () => held.unsubscribe();
  });
</script>

<Line
  bind:line
  onhold={() => notices.hold()}
  onrelease={() => notices.release()}
>
  {#if open && !shut}
    <Panel
      history={notices.history}
      firings={firings.open}
      now={firings.now}
      unsent={waited}
      onclose={() => (open = false)}
      ontake={(id) => notices.take(id)}
      oncancel={cancel}
      onforget={() => notices.clearHistory()}
    />
  {/if}

  <div class="flex h-status items-center gap-x-5 px-3 max-narrow:gap-x-3">
    {#if shut}
      <span class="flex-1"></span>
    {:else}
      <Message
        notice={notices.latest}
        unseen={notices.unseen}
        expanded={open}
        ontoggle={toggle}
        ontake={(id) => notices.take(id)}
      />

      <FiringSegment
        open={firings.open}
        now={firings.now}
        expanded={open}
        oncancel={cancel}
        ontoggle={toggle}
      />
    {/if}

    <Counts
      pending={waited.length}
      queue={shut ? undefined : $queue}
      reachable={pool.yes}
      expanded={open}
      ontoggle={toggle}
    />
  </div>
</Line>
