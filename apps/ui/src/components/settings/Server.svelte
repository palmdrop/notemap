<script lang="ts">
  import { onMount } from "svelte";

  import { saidBy, type SourceUse } from "@notemap/client";

  import Fact from "$components/settings/Fact.svelte";
  import Section from "$components/settings/Section.svelte";
  import Box from "$components/primitives/blocks/Box.svelte";
  import Lead from "$components/primitives/text/Lead.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";
  import { since } from "$lib/stamp";

  const address = $derived(
    import.meta.env.VITE_API_URL ??
      (typeof location === "undefined" ? "" : location.host),
  );

  const pool = reachable();

  let asking = $state(false);
  let said = $state("");

  // How long ago goes on changing while nobody touches anything.
  let now = $state(Date.now());
  onMount(() => {
    const tick = setInterval(() => (now = Date.now()), 1_000);
    return () => clearInterval(tick);
  });

  const answered = $derived(
    pool.at === undefined
      ? undefined
      : `${since(pool.at, now)}${pool.ms === undefined ? "" : `, in ${pool.ms} ms`}`,
  );

  const status = $derived(
    pool.yes
      ? {
          lead: "available",
          rest: answered === undefined ? undefined : `checked ${answered}`,
        }
      : { lead: "unavailable", rest: said === "" ? undefined : said },
  );

  async function knock() {
    asking = true;
    said = "";
    try {
      await client.probe();
    } catch (error) {
      said = saidBy(error);
    } finally {
      asking = false;
    }
  }

  let sources = $state<readonly SourceUse[]>([]);
  let sourcesAsked = $state(false);
  let sourcesFailed = $state("");

  const sourceSince = (source: SourceUse) => ({
    lead: `${String(source.items)} captured`,
    rest: `last ${since(source.lastCapturedAt, now)}`,
  });

  async function readSources() {
    sourcesFailed = "";
    try {
      sources = await client.sources.inUse();
    } catch (error) {
      sourcesFailed = saidBy(error);
    }
  }

  // Read fresh each time the pool comes back into reach, and held nowhere: a
  // remembered figure would say the opposite of what this section is for.
  $effect(() => {
    if (pool.yes && !sourcesAsked) {
      sourcesAsked = true;
      void readSources();
    }
    if (!pool.yes) sourcesAsked = false;
  });
</script>

<Section name="server">
  <Fact name="address">{address}</Fact>
  <Fact name="version">{pool.version ?? "unknown"}</Fact>
  <Fact name="status">
    {#if asking}
      <Asking />
    {:else}
      <Lead {...status} />
    {/if}
  </Fact>
  <Fact name="api">
    <!-- The daemon serves this one, not this app: let the browser leave. -->
    <a href="/docs" data-sveltekit-reload class="hover:underline">
      reference ↗
    </a>
  </Fact>

  <div class="px-gutter py-3">
    <Box icon="refresh" disabled={asking} onclick={() => void knock()}
      >Check again</Box
    >
  </div>

  <Section name="sources" sub>
    {#each sources as source (source.id)}
      <Fact name={source.id}><Lead {...sourceSince(source)} /></Fact>
    {:else}
      {#if sourcesAsked && sourcesFailed === ""}
        <p class="m-0 px-gutter py-3 text-muted">Nothing has captured yet.</p>
      {/if}
    {/each}

    {#if sourcesFailed !== ""}
      <p class="m-0 px-gutter py-3 text-danger">{sourcesFailed}</p>
    {/if}
  </Section>
</Section>
