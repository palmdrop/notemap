<script lang="ts">
  import { saidBy } from "@notemap/client";

  import Row from "$components/settings/Row.svelte";
  import Section from "$components/settings/Section.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import { client } from "$lib/client";
  import { timeOf } from "$lib/stamp";

  /** Where this shell is talking to. Same origin unless a build said otherwise. */
  const address = $derived(
    import.meta.env.VITE_API_URL ??
      (typeof location === "undefined" ? "" : location.host),
  );

  type Answer =
    | { kind: "unasked" }
    | { kind: "asking" }
    | { kind: "ok"; ms: number; at: string }
    | { kind: "bad"; why: string; at: string };

  let answer = $state<Answer>({ kind: "unasked" });

  const said = $derived(
    {
      unasked: ["—", "unasked", "nobody has knocked yet"],
      asking: ["↻", "asking", "waiting for an answer"],
      ok: ["✓", "reachable", ""],
      bad: ["⚠", "unreachable", ""],
    }[answer.kind],
  );

  const why = $derived(
    answer.kind === "ok"
      ? `answered in ${answer.ms} ms, at ${timeOf(answer.at)}`
      : answer.kind === "bad"
        ? `${answer.why}, at ${timeOf(answer.at)}`
        : said[2],
  );

  const tone = $derived(
    ({ unasked: "quiet", asking: "quiet", ok: "good", bad: "bad" } as const)[
      answer.kind
    ],
  );

  /**
   * The destination list is the probe. Knocking on the daemon and refreshing
   * what this page shows are the same request, so asking twice would be a
   * question nobody asked, and there is no route here whose only job is to
   * answer yes.
   */
  async function knock() {
    answer = { kind: "asking" };
    const from = performance.now();

    try {
      await client.destinations.load();
      answer = {
        kind: "ok",
        ms: Math.round(performance.now() - from),
        at: new Date().toISOString(),
      };
    } catch (error) {
      answer = {
        kind: "bad",
        why: saidBy(error),
        at: new Date().toISOString(),
      };
    }
  }
</script>

<Section name="daemon" aside={address}>
  <Row mark={said[0]} what={said[1]} {why} {tone}>
    <span class="ml-6 max-narrow:ml-[var(--spacing-mark)]">
      <Action disabled={answer.kind === "asking"} onclick={knock}>
        <span aria-hidden="true" class="text-ink-muted">↻</span> Check now
      </Action>
    </span>
  </Row>

  <!-- The daemon serves these, not this app: let the browser leave. -->
  <a href="/log" data-sveltekit-reload class="block hover:text-accent">
    <Row mark="↗" what="log" why="every change this pool has made, in order" />
  </a>
  <a href="/docs" data-sveltekit-reload class="block hover:text-accent">
    <Row mark="↗" what="api" why="the reference the daemon serves for itself" />
  </a>

  <p class="mt-4 text-ink-muted">
    Log and api are the daemon's own pages, in its own markup.
  </p>
</Section>
