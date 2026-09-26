<script lang="ts">
  import { onMount } from "svelte";

  import { saidBy, type SourceUse } from "@notemap/client";

  import Fact from "$components/settings/Fact.svelte";
  import Section from "$components/settings/Section.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";
  import { since } from "$lib/stamp";
  import { slide } from "$lib/motion";

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
      ? `available${answered === undefined ? "" : ` · checked ${answered}`}`
      : `unavailable${said === "" ? "" : ` — ${said}`}`,
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
  let showSources = $state(false);

  const sourceSince = (source: SourceUse) =>
    `${String(source.items)} captured · last ${since(source.lastCapturedAt, now)}`;

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
      {status}
    {/if}
    <Action disabled={asking} onclick={() => void knock()}>check again</Action>
  </Fact>
  <Fact name="api">
    <!-- The daemon serves this one, not this app: let the browser leave. -->
    <a href="/docs" data-sveltekit-reload class="hover:underline">
      reference ↗
    </a>
  </Fact>

  <Section name="sources" sub>
    {#snippet right()}
      <Action onclick={() => (showSources = !showSources)}>
        {showSources ? "hide" : "show"}
      </Action>
    {/snippet}

    {#if showSources}
      <div transition:slide={{ magnitude: "short" }}>
        {#each sources as source (source.id)}
          <Fact name={source.id}>{sourceSince(source)}</Fact>
        {/each}

        {#if sourcesFailed !== ""}
          <p class="mt-2 text-alarm">{sourcesFailed}</p>
        {/if}
      </div>
    {/if}
  </Section>
</Section>
