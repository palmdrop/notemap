<script lang="ts">
  import { saidBy } from "@notemap/client";

  import Row from "$components/settings/Row.svelte";
  import Section from "$components/settings/Section.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import { client } from "$lib/client";
  import { timeOf } from "$lib/stamp";

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

  /** `/v1` has no route whose only job is to answer yes, and this read is one
   *  the page wants anyway. */
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

  <a href="/log" class="block hover:text-accent">
    <Row mark="→" what="log" why="every change this pool has made, in order" />
  </a>

  <!-- The daemon serves this one, not this app: let the browser leave. -->
  <a href="/docs" data-sveltekit-reload class="block hover:text-accent">
    <Row mark="↗" what="api" why="the reference the daemon serves for itself" />
  </a>

  <p class="mt-4 text-ink-muted">
    The api reference is the daemon's own page, in its own markup.
  </p>
</Section>
