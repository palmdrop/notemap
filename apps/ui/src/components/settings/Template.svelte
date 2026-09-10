<script lang="ts">
  import type { Destination, RoutingTemplate } from "@notemap/client";
  import type { RoutingTemplateReport } from "@notemap/client";

  import Fact from "$components/settings/Fact.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import { pickable } from "$lib/pick";
  import { nameFor } from "$lib/names.svelte";
  import { resolve } from "$lib/naming";
  import { placeOf } from "$lib/templates";

  let {
    one,
    destination,
    report,
    asking,
    opened,
    editing,
    offline,
    onopen,
    oncheck,
    onedit,
    ondelete,
    children,
  }: {
    one: RoutingTemplate;
    /** Absent means it was deleted under the template, which is what strands one. */
    destination?: Destination;
    report?: RoutingTemplateReport;
    asking: boolean;
    opened: boolean;
    /**
     * The form is open below. What a template says and what it is being changed
     * to are the same fields twice, and the settled copy is the one to go: a
     * row reading `create` above an input reading `require` says the template
     * refused the edit.
     */
    editing: boolean;
    offline: boolean;
    onopen: () => void;
    oncheck: () => void;
    onedit: () => void;
    ondelete: () => void;
    children?: import("svelte").Snippet;
  } = $props();

  const stranded = $derived(destination === undefined);

  /**
   * What the row leads with. Only the two that a person has to act on take the
   * accent: *could not ask* is an ordinary condition — a vault asleep on a
   * train — and lighting up four rows for it would make the colour say nothing.
   */
  const said = $derived.by(() => {
    if (report === undefined) {
      return asking
        ? { mark: "↻", text: "asking", tone: "text-ink-muted" }
        : { mark: "", text: "not asked yet", tone: "text-ink-muted" };
    }

    switch (report.kind) {
      case "fits":
        return { mark: "✓", text: "fits", tone: "text-good" };
      case "stranded":
        return { mark: "⚠", text: "destination deleted", tone: "text-accent" };
      case "destination-retired":
        return { mark: "⚠", text: "destination retired", tone: "text-accent" };
      case "folder-missing":
        return {
          mark: "⚠",
          text: `${report.folder} missing`,
          tone: "text-accent",
        };
      case "capability-undeclared":
        return {
          mark: "⚠",
          text: `${report.capability} is no longer offered`,
          tone: "text-accent",
        };
      case "arguments-invalid":
        return { mark: "⚠", text: "arguments refused", tone: "text-accent" };
      case "destination-unusable":
        return { mark: "", text: report.detail, tone: "text-ink-muted" };
      case "unreachable":
        return { mark: "", text: "not reachable", tone: "text-ink-muted" };
    }
  });

  /**
   * Asked once per row, and only for what is not remembered already: this page
   * draws pool state and a channel id says nothing a person can read. What
   * comes back is kept, so the second visit draws names before anything is
   * asked and a pool nobody can reach still says which channel.
   */
  $effect(() => {
    const asking = one;
    void resolve(
      asking.destination,
      Object.keys(asking.arguments).map((field) => ({
        capability: asking.capability,
        field,
        value: String(asking.arguments[field] ?? ""),
      })),
    );
  });

  const place = $derived(
    placeOf(one, (field, value) =>
      nameFor({
        destination: one.destination,
        capability: one.capability,
        field,
        value,
      }),
    ),
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="border-b border-b-ink/20 py-4" onclick={pickable(onopen)}>
  <div class="flex cursor-pointer flex-wrap items-baseline gap-x-3">
    <span
      aria-hidden="true"
      class="w-[1ch] flex-none {stranded ? 'text-ink-muted' : ''}"
    >
      {stranded ? "○" : "●"}
    </span>
    <button
      type="button"
      onclick={onopen}
      aria-expanded={opened}
      class="tracking-wider uppercase hover:text-accent {stranded
        ? 'text-ink-muted'
        : ''}"
    >
      {one.name}
    </button>
    <span class="text-ink-muted">{destination?.name ?? one.destination}</span>

    <span
      class="ml-auto whitespace-nowrap {said.tone} max-narrow:ml-[var(--spacing-mark)] max-narrow:w-full"
    >
      {said.mark}
      {said.text}
    </span>
  </div>

  <div
    class="mt-1 flex flex-wrap items-baseline gap-x-2 pl-[var(--spacing-mark)]"
  >
    {#if one.triggerTag !== undefined}
      <span class="px-1 {stranded ? 'text-ink-muted' : 'inverted'}">
        {one.triggerTag}
      </span>
      <span aria-hidden="true" class="text-ink-muted">→</span>
    {/if}
    <span class="break-all text-ink-muted">{place}</span>
  </div>

  {#if stranded}
    <p class="mt-1 pl-[var(--spacing-mark)] text-accent">
      Does nothing until repointed.
    </p>
  {/if}

  {#if opened}
    <div class="mt-4 pl-[var(--spacing-mark)]">
      {#if !editing}
        <Fact name="tag" empty={one.triggerTag === undefined}>
          {one.triggerTag ?? "none — taken in the composer"}
        </Fact>
        <Fact name="into" empty={stranded}>
          {destination?.name ?? `${one.destination} · deleted`}
        </Fact>
        <Fact name="action">{one.capability}</Fact>
        <Fact name="path">{place}</Fact>
        <Fact name="folder">
          {one.folder}{one.folder === "establish"
            ? one.establishedAt === undefined
              ? " · not established yet"
              : ` · established ${one.establishedAt.slice(0, 10)}`
            : ""}
        </Fact>
        <Fact name="fired" empty={one.fired.records === 0}>
          {one.fired.records === 0
            ? "nothing yet"
            : `${String(one.fired.records)} items${
                one.fired.lastAt === undefined
                  ? ""
                  : ` · last ${one.fired.lastAt.slice(0, 10)}`
              }`}
        </Fact>

        {#if report?.kind === "folder-missing"}
          <p class="mt-2 text-accent">
            Next delivery refused, and the item returns to the queue.
          </p>
        {/if}

        <div
          class="mt-4 flex flex-wrap items-baseline gap-x-6 border-t border-t-ink/20 pt-3"
        >
          {#if !stranded}
            <Action disabled={asking} onclick={oncheck}>
              <span aria-hidden="true" class="text-ink-muted">↻</span>
              {report === undefined ? "Check" : "Check again"}
            </Action>
          {/if}
          <Action disabled={offline} onclick={onedit}>
            <span aria-hidden="true" class="text-ink-muted">✎</span>
            {stranded ? "Repoint" : "Edit"}
          </Action>
          <span class="ml-auto max-narrow:ml-0">
            <Action disabled={offline} onclick={ondelete}>
              <span class="text-accent">
                <span aria-hidden="true">×</span> Delete
              </span>
            </Action>
          </span>
        </div>
      {/if}

      {@render children?.()}
    </div>
  {/if}
</div>
