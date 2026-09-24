<script lang="ts">
  import { onMount } from "svelte";

  import type { Action } from "@notemap/client";

  import { itemHref } from "$components/item/href";
  import Refusals from "$components/outbox/Refusals.svelte";
  import Alarm from "$components/primitives/alarm/Alarm.svelte";
  import Notice from "$components/primitives/alarm/Notice.svelte";
  import { noticeOf } from "$lib/action-log";
  import { client } from "$lib/client";
  import { cancelRouting } from "$lib/firing";
  import { nameOf } from "$lib/destinations";
  import { nameOf as templateOf } from "$lib/templates";
  import { aboutItem } from "$lib/excerpt";
  import { notices } from "$lib/notices.svelte";

  const shown = $derived(notices.shown);
  const folded = $derived(notices.folded);

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

  async function say(actions: readonly Action[]) {
    for (const action of actions) {
      const raised = noticeOf(action, {
        nameOf,
        templateOf,
        about: itemHref,
        cancel: cancelRouting,
      });
      if (raised === undefined) continue;

      const about = await whichCapture(action.subject);
      notices.raise(about === undefined ? raised : { ...raised, about });
    }
  }

  // What happened while nobody was asking. The corner is the only reader of it,
  // so the watcher is started by the thing that draws what it answers.
  onMount(() => {
    const held = client.actions.watch().subscribe((since) => {
      if (since.more) {
        tooMuch(since.actions.length);
        return;
      }

      void say(since.actions);
    });

    return () => held.unsubscribe();
  });
</script>

<!--
  Everything the shell says in its own voice, in one place. Refusals sit last
  because they are the ones nothing but a person will clear, and the bottom of
  the corner is the reachable end of it.
-->
<Alarm onhold={() => notices.hold()} onrelease={() => notices.release()}>
  {#if folded > 0}
    <Notice what={`${String(folded)} more`} href="/log" standing />
  {/if}

  {#each shown as notice (notice.id)}
    <Notice
      what={notice.what}
      why={notice.why}
      about={notice.about}
      href={notice.href}
      offer={notice.offer === undefined
        ? undefined
        : { label: notice.offer.label, take: () => notices.take(notice.id) }}
      standing={notice.standing === true}
      alarm={notice.alarm}
      ondismiss={() => notices.dismiss(notice.id)}
    />
  {/each}

  <Refusals />
</Alarm>
