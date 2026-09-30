<script lang="ts">
  import type { Action } from "@notemap/client";

  import { itemHref } from "$components/item/href";
  import Line from "$components/primitives/frame/Line.svelte";
  import { firingOf, noticeOf } from "$lib/action-log";
  import { client } from "$lib/client";
  import { publish } from "$lib/command/stack.svelte";
  import { nameOf } from "$lib/destinations";
  import { aboutItem } from "$lib/excerpt";
  import { cancelRouting } from "$lib/firing";
  import { firings, type Firing } from "$lib/firings.svelte";
  import { notices } from "$lib/notices.svelte";
  import { outgoing } from "$lib/outgoing";
  import { reachable } from "$lib/reachable.svelte";
  import { heldName, nameOf as templateOf } from "$lib/templates";

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
  const newestRefusal = $derived.by(() => {
    const held = refused.at(-1);
    return held === undefined
      ? undefined
      : { id: held.id, what: `refused — ${outgoing(held.operation).what}` };
  });
  const clear = $derived(
    notices.standing.filter((notice) => notice.alarm !== false).length +
      refused.length,
  );

  function toggle(): void {
    open = !open;
  }

  function cancel(firing: Firing): void {
    cancelRouting(firing.record, firing.item);
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

  /** The one standing mark that a catch-up was too long to read out. */
  let missed = $state<string | undefined>(undefined);

  /**
   * A read that could not reach back to the mark is a person who has been away,
   * and a page of failures nobody may dismiss is not a report of it. They are
   * counted and left in the log, which is where a day's worth belongs.
   */
  function tooMuch(since: number) {
    if (missed !== undefined) notices.dismiss(missed);
    missed = notices.raise({
      what: `${String(since)} or more things happened`,
      why: "while this was away",
      href: "/log",
      standing: true,
    });
  }

  async function hear(actions: readonly Action[]) {
    for (const action of actions) {
      const firing = firingOf(action, {
        templateOf: heldName,
        about: itemHref,
      });
      if (firing !== undefined) {
        if ("opened" in firing) firings.opened(firing.opened);
        else firings.closed(firing.closed);
      }

      const raised = noticeOf(action, {
        nameOf,
        templateOf,
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
      {unsent}
      {refused}
      onclose={() => (open = false)}
      ontake={(id) => notices.take(id)}
      ondismiss={(id) => notices.dismiss(id)}
      oncancel={cancel}
      onforget={() => notices.clearHistory()}
      onrelease={(operation) => void client.dismiss(operation)}
    />
  {/if}

  <div class="flex h-status items-center gap-x-5 max-narrow:gap-x-3">
    {#if shut}
      <span class="flex-1"></span>
    {:else}
      <Message
        notice={notices.latest}
        refused={newestRefusal}
        told={notices.history.length}
        expanded={open}
        ontoggle={toggle}
        ontake={(id) => notices.take(id)}
        ondismiss={(id) => notices.dismiss(id)}
        onrelease={(operation) => void client.dismiss(operation)}
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
      pending={unsent.length}
      clear={shut ? 0 : clear}
      queue={shut ? undefined : $queue}
      reachable={pool.yes}
      expanded={open}
      ontoggle={toggle}
    />
  </div>
</Line>
