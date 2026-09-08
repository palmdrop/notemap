<script lang="ts">
  import { onMount } from "svelte";

  import { saidBy, type SourceUse } from "@notemap/client";

  import Row from "$components/settings/Row.svelte";
  import Section from "$components/settings/Section.svelte";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";
  import { since } from "$lib/stamp";

  const pool = reachable();

  let held = $state<readonly SourceUse[]>([]);
  let asked = $state(false);
  let said = $state("");

  // How long ago goes on changing while nobody touches anything, which is the
  // whole point here: a source that stopped is one whose figure keeps growing.
  let now = $state(Date.now());
  onMount(() => {
    const tick = setInterval(() => (now = Date.now()), 1_000);
    return () => clearInterval(tick);
  });

  const tally = $derived(
    held.length === 0 ? "none yet" : `${String(held.length)} seen`,
  );

  const why = (source: SourceUse) =>
    `${String(source.items)} captured · last ${since(source.lastCapturedAt, now)}`;

  async function read() {
    said = "";
    try {
      held = await client.sources.inUse();
    } catch (error) {
      said = saidBy(error);
    }
  }

  // A page opened while the daemon was down has nothing; coming back is the
  // only moment anything will ask again.
  $effect(() => {
    if (pool.yes && !asked) {
      asked = true;
      void read();
    }
    if (!pool.yes) asked = false;
  });
</script>

<Section name="sources" aside={tally}>
  <p class="mt-4 text-ink-muted">
    Every channel an item in this pool came in through, most recent first. A
    source is discovered rather than declared, so this is what the items say and
    not a list anyone keeps.
  </p>

  {#each held as source (source.id)}
    <Row mark="·" what={source.id} why={why(source)} />
  {/each}

  {#if said !== ""}
    <p class="mt-4 text-accent">{said}</p>
  {/if}
</Section>
