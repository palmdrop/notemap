<script lang="ts">
  import {
    saidBy,
    type Capability,
    type DestinationDescription,
    type RoutingPreview,
    type RoutingRecord,
  } from "@notemap/client";

  import ComposerTags from "$components/routing/ComposerTags.svelte";
  import DestinationLine from "$components/routing/DestinationLine.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import Commit from "$components/primitives/composer/Commit.svelte";
  import Group from "$components/primitives/composer/Group.svelte";
  import Labelled from "$components/primitives/composer/Labelled.svelte";
  import Modal from "$components/primitives/composer/Modal.svelte";
  import Option from "$components/primitives/composer/Option.svelte";
  import { placeOf } from "@notemap/output-markdown/naming";

  import CandidateBrowser from "$components/routing/CandidateBrowser.svelte";
  import Output from "$components/routing/Output.svelte";
  import { browserFor } from "$lib/candidate-browsers";
  import { client } from "$lib/client";
  import {
    NO_PREVIEW_OFFERED,
    PREVIEW_IS_INDICATIVE,
    PREVIEW_NOT_TEXT,
    PREVIEW_UNREACHABLE,
  } from "$lib/said";
  import { fieldsOf, valuesFrom } from "$lib/schema-form";

  const CREATE_FILE = "create-file";
  /** What the typed line drives: the capability that decides at delivery. */
  const CREATE_OR_APPEND_FILE = "create-or-append-file";
  /** The one field the typed line drives, and the only one `⇧⏎` has to re-read. */
  const LINE_FIELD = "path";

  let {
    item,
    subject,
    content,
    tags = [],
    onrouted,
    onclose,
  }: {
    item: string;
    /** What the row said, since the row itself is now behind the veil. */
    subject: string;
    /** The item's own payload, from which the name of an unnamed note is derived. */
    content?: unknown;
    /** What the item already carries, so the composer's own row draws them as taken. */
    tags?: readonly string[];
    /**
     * The decision reached the pool. What is said about it, and where the row
     * stood, belong to the surface rather than to a modal over it.
     */
    onrouted?: (record: RoutingRecord) => void;
    onclose: () => void;
  } = $props();

  const destinations = client.destinations.all;

  let chosen = $state<string | undefined>(undefined);
  let described = $state<DestinationDescription | undefined>(undefined);
  let capability = $state<string | undefined>(undefined);
  let args = $state<Record<string, string>>({});
  let said = $state("");
  let busy = $state(false);

  /** Why one cannot be routed to, learnt by asking it. Retirement needs no asking. */
  let refusing = $state<Record<string, string>>({});

  let shown = $state<RoutingPreview | undefined>(undefined);
  let showing = $state(false);

  const capabilities = $derived<readonly Capability[]>(
    described?.kind === "described" ? described.capabilities : [],
  );

  const fields = $derived(
    fieldsOf(
      capabilities.find((one) => one.name === capability)?.argumentsSchema,
    ),
  );

  const destinationKind = $derived(
    $destinations.find((one) => one.id === chosen)?.kind,
  );

  /**
   * Where the line is what draws the place, *what will happen* is not a step:
   * it is read off the line and said in one word, and `⇧⏎` is the way to the
   * one capability that overrides it. A kind that draws the schema-driven
   * browser still chooses, because its capabilities are its own and nothing
   * here can pick among them.
   */
  const settles = $derived(
    destinationKind !== undefined &&
      browserFor(destinationKind) !== CandidateBrowser &&
      capabilities.some((one) => one.name === CREATE_OR_APPEND_FILE),
  );

  $effect(() => {
    if (settles) capability = CREATE_OR_APPEND_FILE;
  });

  const ready = $derived(chosen !== undefined && capability !== undefined);

  /** Taken, the destination leaves the line and reads here instead. */
  const chrome = $derived(
    chosen === undefined
      ? "route"
      : `route · ${$destinations.find((one) => one.id === chosen)?.name ?? ""}`,
  );

  /** A wrong destination is not a reason to close the composer. */
  function release(): void {
    chosen = undefined;
    described = undefined;
    capability = undefined;
    args = {};
    said = "";
  }

  /** Serialised because a keystroke changes a field of `args` rather than `args`. */
  const decision = $derived(JSON.stringify({ chosen, capability, args }));

  // What was shown was shown for the decision as it then stood, so changing any
  // part of it drops the answer rather than leaving a stale one under the line.
  $effect(() => {
    void decision;
    shown = undefined;
  });

  /** On demand and never on a keystroke: the conversion may be a model call. */
  async function show() {
    if (chosen === undefined || capability === undefined) return;

    // The answer belongs to the decision it was asked with. One that resolves
    // after the person has moved on is dropped rather than drawn under
    // arguments it knows nothing about.
    const asked = decision;
    showing = true;
    said = "";
    try {
      const answer = await client.routing.preview(item, {
        destination: chosen,
        capability,
        arguments: valuesFrom(fields, args),
      });
      if (asked === decision) shown = answer;
    } catch (error) {
      if (asked === decision) said = saidBy(error);
    } finally {
      showing = false;
    }
  }

  const nothingShown = $derived.by(() => {
    switch (shown?.kind) {
      case "not-offered":
        return NO_PREVIEW_OFFERED;
      case "unreachable":
        return `${PREVIEW_UNREACHABLE} ${shown.detail}`;
      case "rejected":
        return `This would be refused: ${shown.detail}`;
      case "previewed":
        return shown.content !== undefined && shown.content.text === undefined
          ? `${PREVIEW_NOT_TEXT} ${shown.content.mediaType}`
          : "";
      default:
        return "";
    }
  });

  // Which destinations exist is not stable for the life of a connection, so
  // opening the composer reads them again rather than trusting what it holds.
  $effect(() => {
    void (async () => {
      try {
        await client.destinations.load();
      } catch (error) {
        said = saidBy(error);
      }
    })();
  });

  function freshFile(beside: string): {
    capability: string;
    arguments: Record<string, unknown>;
  } {
    const place = placeOf(args[LINE_FIELD] ?? "");
    return {
      capability: CREATE_FILE,
      arguments: { directory: place.directory, filename: beside },
    };
  }

  function reasonFor(id: string, retired: boolean): string | undefined {
    if (retired) return "retired";
    return refusing[id];
  }

  /** I/O that may hang on an unmounted drive, so it happens for the chosen one alone. */
  async function choose(id: string) {
    chosen = id;
    described = undefined;
    capability = undefined;
    args = {};
    said = "";

    try {
      const report = await client.destinations.describe(id);
      if (report.kind === "described") {
        described = report;
        return;
      }

      // Present and unavailable: it stays in the list saying why, rather than
      // disappearing or looking routable.
      refusing = { ...refusing, [id]: `${report.kind} — ${report.detail}` };
      chosen = undefined;
    } catch (error) {
      refusing = { ...refusing, [id]: saidBy(error) };
      chosen = undefined;
    }
  }

  /**
   * `beside` is `⇧⏎`: the person meant a new note rather than an addition to
   * the one that is there, and `create-file` is the capability that promises
   * exactly that — it refuses a name that is taken rather than writing into it.
   */
  async function send(beside?: string) {
    if (chosen === undefined || capability === undefined) return;

    busy = true;
    said = "routing…";
    try {
      const record = await client.routing.route(item, {
        destination: chosen,
        ...(beside === undefined
          ? { capability, arguments: valuesFrom(fields, args) }
          : freshFile(beside)),
      });
      onrouted?.(record);
      onclose();
    } catch (error) {
      said = saidBy(error);
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={chrome} {subject} {onclose}>
  <!-- Above `where` is where a decision that arrived pre-filled with an
       attribution goes. Nothing produces that shape yet. -->

  <Group name="where">
    {#if chosen === undefined}
      <DestinationLine
        destinations={$destinations}
        unusable={refusing}
        ontake={(id) => void choose(id)}
      />
    {/if}
    {#each $destinations as one (one.id)}
      <Option
        label={one.name}
        chosen={chosen === one.id}
        why={reasonFor(one.id, one.retired === true)}
        onchoose={() => void choose(one.id)}
      />
    {/each}
  </Group>

  {#if capabilities.length > 0 && !settles}
    <Group name="do">
      {#each capabilities as one (one.name)}
        <Option
          label={one.name}
          chosen={capability === one.name}
          onchoose={() => {
            capability = one.name;
            args = {};
          }}
        />
      {/each}
    </Group>
  {/if}

  <!-- A field's own `description` is a sentence, and the composer's copy is a
       word or a mark. What a field means is the label and the control. -->
  {#each fields as field (field.name)}
    {#snippet control()}
      {#if field.askable && chosen !== undefined && capability !== undefined && destinationKind !== undefined}
        {@const Browser = browserFor(destinationKind)}
        <Browser
          destination={chosen}
          {capability}
          field={field.name}
          label={field.title ?? field.name}
          value={args[field.name] ?? ""}
          said={field.name === LINE_FIELD ? { content, item } : undefined}
          onchange={(value) => (args = { ...args, [field.name]: value })}
          onsubmit={(beside) => void send(beside)}
          onrelease={release}
        />
      {:else}
        <input
          bind:value={args[field.name]}
          placeholder={field.required ? "required" : "optional"}
          aria-label={field.title ?? field.name}
          class="w-full border-b border-ink bg-transparent font-mono placeholder:text-ink-muted"
        />
      {/if}
    {/snippet}

    {#if settles}
      <!-- Where the line draws the place, nothing here is a step: the line is
           the decision and what sits beside it is a terse row, as `tags` is. -->
      {#if field.name === LINE_FIELD}
        <div class="mt-4">{@render control()}</div>
      {:else}
        <Labelled name={field.title ?? field.name}>{@render control()}</Labelled
        >
      {/if}
    {:else}
      <Group name={field.title ?? field.name}>{@render control()}</Group>
    {/if}
  {/each}

  <ComposerTags {item} names={tags} />

  {#if shown !== undefined}
    <div class="mt-6">
      <Output
        heading="would write"
        note={shown.kind === "previewed" ? shown.note : undefined}
        text={shown.kind === "previewed" ? shown.content?.text : undefined}
        truncated={shown.kind === "previewed" &&
          shown.content?.truncated === true}
        said={nothingShown}
      />
      {#if shown.kind === "previewed"}
        <div class="mt-2 font-mono text-ink-muted">
          {PREVIEW_IS_INDICATIVE}
        </div>
      {/if}
    </div>
  {/if}

  <Commit>
    <Action primary disabled={!ready || busy} onclick={() => void send()}
      >route</Action
    >
    <Action disabled={!ready || busy || showing} onclick={() => void show()}>
      {showing ? "asking…" : "preview"}
    </Action>
    <Action onclick={onclose}>cancel</Action>
    {#if said !== ""}
      <span role="status" class="text-ink-muted">{said}</span>
    {/if}
  </Commit>
</Modal>
