<script lang="ts">
  import Refusals from "$components/outbox/Refusals.svelte";
  import Alarm from "$components/primitives/alarm/Alarm.svelte";
  import Notice from "$components/primitives/alarm/Notice.svelte";
  import { notices } from "$lib/notices.svelte";

  const shown = $derived(notices.shown);
  const folded = $derived(notices.folded);
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
