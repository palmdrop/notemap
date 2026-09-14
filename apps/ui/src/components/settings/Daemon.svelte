<script lang="ts">
  import { onMount } from "svelte";

  import { resolve } from "$app/paths";

  import { saidBy } from "@notemap/client";

  import Row from "$components/settings/Row.svelte";
  import Section from "$components/settings/Section.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
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

  type Reading = {
    mark: string;
    what: string;
    why: string;
    tone: "good" | "bad" | "quiet";
  };

  const reading = $derived<Reading>(
    asking
      ? {
          mark: "↻",
          what: "asking",
          why: "waiting for an answer",
          tone: "quiet",
        }
      : pool.yes
        ? {
            mark: "✓",
            what: "reachable",
            why: answered ?? "optimistically, until anything answers",
            tone: "good",
          }
        : {
            mark: "⚠",
            what: "unreachable",
            why: said || (answered ?? "nothing has answered"),
            tone: "bad",
          },
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
</script>

<Section name="daemon" aside={address}>
  <Row
    mark={reading.mark}
    what={reading.what}
    why={reading.why}
    tone={reading.tone}
  >
    <span class="ml-6 max-narrow:ml-7">
      <Action disabled={asking} onclick={knock}>
        <span aria-hidden="true">↻</span> Check again
      </Action>
    </span>
  </Row>

  <a href={resolve("/log")} class="block hover:underline">
    <Row mark="→" what="log" why="every change this pool has made, in order" />
  </a>

  <!-- The daemon serves this one, not this app: let the browser leave. -->
  <a href="/docs" data-sveltekit-reload class="block hover:underline">
    <Row mark="↗" what="api" why="the reference the daemon serves for itself" />
  </a>

  <p class="mt-4">
    The api reference is the daemon's own page, in its own markup.
  </p>
</Section>
