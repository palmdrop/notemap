<script lang="ts">
  import { onMount } from "svelte";

  import Refusals from "$components/outbox/Refusals.svelte";
  import Alarm from "$components/primitives/alarm/Alarm.svelte";
  import Notice from "$components/primitives/alarm/Notice.svelte";
  import { client } from "$lib/client";
  import { nameOf } from "$lib/destinations";
  import { noticeOf } from "$lib/happened";
  import { notices } from "$lib/notices.svelte";

  const shown = $derived(notices.shown);
  const folded = $derived(notices.folded);

  // What happened while nobody was asking. The corner is the only reader of it,
  // so the watcher is started by the thing that draws what it answers.
  onMount(() => {
    const held = client.actions.watch().subscribe((said) => {
      for (const action of said.actions) {
        const raised = noticeOf(action, nameOf);
        if (raised !== undefined) notices.raise(raised);
      }

      if (said.more) {
        notices.raise({
          what: "more happened",
          why: "than this can hold",
          href: "/log",
          standing: true,
        });
      }
    });

    return () => held.unsubscribe();
  });
</script>

<!--
  Everything the shell says in its own voice, in one place. Refusals sit last
  because they are the ones nothing but a person will clear, and the bottom of
  the corner is the reachable end of it.
-->
<Alarm>
  {#if folded > 0}
    <Notice what={`${String(folded)} more`} href="/log" standing />
  {/if}

  {#each shown as notice (notice.id)}
    <Notice
      what={notice.what}
      why={notice.why}
      href={notice.href}
      standing={notice.standing === true}
      ondismiss={notice.standing === true
        ? () => notices.dismiss(notice.id)
        : undefined}
    />
  {/each}

  <Refusals />
</Alarm>
