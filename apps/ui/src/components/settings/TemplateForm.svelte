<script lang="ts">
  import { untrack } from "svelte";

  import {
    saidBy,
    type Capability,
    type Destination,
    type RoutingTemplate,
  } from "@notemap/client";

  import Band from "$components/primitives/blocks/Band.svelte";
  import RadioRows from "$components/primitives/blocks/RadioRows.svelte";
  import Segmented from "$components/primitives/blocks/Segmented.svelte";
  import Toggle from "$components/primitives/blocks/Toggle.svelte";
  import CandidateBrowser from "$components/routing/CandidateBrowser.svelte";
  import PathLine from "$components/routing/PathLine.svelte";
  import { OWN_ARGUMENTS } from "$lib/arguments";
  import { askable } from "$lib/asked";
  import { carriesAssets } from "$lib/capability";
  import { client } from "$lib/client";
  import { headed } from "$lib/heading.svelte";
  import { trailTo } from "./href";
  import { kindName } from "$lib/looks";
  import { actionOf, labelFor, wordFor } from "$lib/vocabulary";

  import FormBar from "./form/FormBar.svelte";
  import Guard from "./form/Guard.svelte";
  import type { RoutingTemplateDraft } from "$lib/template-draft";
  import { TRIGGER_NAMESPACE } from "$lib/trigger";
  import {
    effectiveOf,
    fieldsOf,
    givenFor,
    impliedOf,
    labelOf,
    offered,
    typedFrom,
    valuesFrom,
    type Field,
  } from "$lib/schema-form";

  let {
    destinations,
    editing,
    starting,
    disabled,
    done,
  }: {
    destinations: readonly Destination[];
    editing?: RoutingTemplate;
    /** What a new template starts from, where it is being saved from a decision already made. */
    starting?: RoutingTemplateDraft;
    disabled: boolean;
    done: () => void;
  } = $props();

  const id = $props.id();

  /** Where an asked field says it has no default, for the inputs that ask it to be read out. */
  const undefaulted = (field: Field): string | undefined =>
    Object.hasOwn(asked, field.name) && (typed[field.name] ?? "") === ""
      ? `${id}-${field.name}-default`
      : undefined;

  /** The namespace a trigger tag lives in. Not typed: it is what marks one. */

  /** What a place can be named from, in words, and the pattern each puts in. */
  const PATTERNS = [
    { word: "date", pattern: "{{captured_at}}" },
    { word: "month", pattern: "{{captured_at:month}}" },
    { word: "week", pattern: "{{captured_at:week}}" },
    { word: "the item's words", pattern: "{{item}}" },
    { word: "source", pattern: "{{source}}" },
  ] as const;

  const FOLDERS = [
    { name: "create", word: "Make it", note: "Made when it isn't there." },
    {
      name: "require",
      word: "Must exist",
      note: "The delivery is rejected when it isn't there.",
    },
    {
      name: "establish",
      word: "Make it once",
      note: "Made the first time, and must exist after.",
    },
  ] as const;

  // Where the form starts, not what it holds: nothing changes under a typist.
  let name = $state(untrack(() => editing?.name ?? ""));
  let tag = $state(
    untrack(() => editing?.triggerTag?.slice(TRIGGER_NAMESPACE.length) ?? ""),
  );
  const from = untrack(() => editing ?? starting);
  let destination = $state(
    from?.destination ?? untrack(() => destinations[0]?.id ?? ""),
  );
  let capability = $state(from?.capability ?? "");
  let folder = $state(from?.folder ?? "create");
  let typed = $state(typedFrom(from?.arguments));
  /** Asked fields by name, each holding the label typed for it, blank for none. */
  let asked = $state<Record<string, string>>(
    untrack(() =>
      Object.fromEntries(
        Object.entries(editing?.asked ?? {}).map(([field, one]) => [
          field,
          one.label ?? "",
        ]),
      ),
    ),
  );

  function ask(field: string): void {
    if (Object.hasOwn(asked, field)) {
      const { [field]: _dropped, ...rest } = asked;
      asked = rest;
    } else {
      asked = { ...asked, [field]: "" };
    }
  }

  let nameField = $state<HTMLInputElement | undefined>(undefined);
  $effect(() => nameField?.focus());

  let capabilities = $state<readonly Capability[]>([]);
  let said = $state("");
  let busy = $state(false);
  const unnamed = $derived(name.trim() === "");

  const declared = $derived(
    fieldsOf(
      capabilities.find((one) => one.name === capability)?.argumentsSchema,
    ),
  );

  /** What an argument left unset falls back to, where the kind says it inherits one. */
  const inherited = $derived(
    destinations.find((one) => one.id === destination)?.settings ?? {},
  );

  /** Only the fields that mean something given the others, as the composer draws them. */
  const fields = $derived.by(() => {
    const effective = effectiveOf(declared, typed, inherited);
    return declared.filter((one) => offered(one, effective));
  });

  /**
   * The capability carrying the attachments alone is chosen under `output`,
   * not among the others under `action`, wherever there are others to choose.
   */
  const carrier = $derived(capabilities.find(carriesAssets));
  const actions = $derived(capabilities.filter((one) => !carriesAssets(one)));
  const offersOutput = $derived(carrier !== undefined && actions.length > 0);
  const assetsOnly = $derived(
    carrier !== undefined && capability === carrier.name,
  );

  /** The action held before `attachments only` was taken, which `everything` gives back. */
  let before = $state<string | undefined>(undefined);

  function output(attachmentsOnly: boolean): void {
    if (attachmentsOnly === assetsOnly) return;
    if (attachmentsOnly) {
      before = capability;
      capability = carrier?.name ?? capability;
      return;
    }
    capability =
      actions.find((one) => one.name === before)?.name ??
      actions[0]?.name ??
      capability;
  }

  /**
   * Notemap's own arguments are drawn as their own controls below, so the
   * schema's fields for them are not drawn twice.
   */
  const typeable = $derived(
    fields.filter((one) => !OWN_ARGUMENTS.includes(one.name)),
  );

  /**
   * Only where the capability has folders at all. A destination that files to a
   * board column or a mailbox declares no folder mode, and offering one would
   * be a control whose every setting the pool refuses.
   */
  const folders = $derived(fields.some((one) => one.name === "folder"));

  /**
   * A field the schema constrains is chosen; anything else is typed, because a
   * template's value may be a pattern and a pattern is in no enumeration. So a
   * fixed set of places is picked from and a path is written.
   */
  const fixed = (field: Field): readonly string[] | undefined =>
    field.options ?? field.examples;

  /**
   * The last field a pattern can be written into, which is where the
   * vocabulary is said: under the place it is for, not under whatever
   * switches happen to follow. Nothing, where nothing can hold one — a form
   * of chosen fields has nowhere to put a pattern, and neither has one whose
   * every typed field may hold only what its destination already has; a
   * pattern expanded into an are.na channel names a channel nobody has.
   */
  const patterned = $derived(
    typeable.findLast(
      (field) => fixed(field) === undefined && !field.offeredOnly,
    )?.name,
  );

  // The list may arrive after the form opens, and a form that started with
  // nothing to point at would never find one.
  $effect(() => {
    if (destination === "" && destinations.length > 0) {
      destination = destinations[0]?.id ?? "";
    }
  });

  // What the destination can do is I/O; it is asked for the chosen one alone,
  // and again when a different one is chosen.
  $effect(() => {
    const chosen = destination;
    if (chosen === "") return;
    let live = true;

    void (async () => {
      try {
        const report = await client.destinations.describe(chosen);
        if (!live) return;
        capabilities = report.kind === "described" ? report.capabilities : [];
        if (!capabilities.some((one) => one.name === capability)) {
          capability = capabilities[0]?.name ?? "";
        }
      } catch (error) {
        if (live) said = saidBy(error);
      }
    })();

    return () => {
      live = false;
    };
  });

  /** What is asked among the fields still drawn, each label trimmed and a blank one left out. */
  function asking(): Record<string, { label?: string }> {
    return Object.fromEntries(
      typeable
        .filter((field) => askable(field) && Object.hasOwn(asked, field.name))
        .map((field) => {
          const label = (asked[field.name] ?? "").trim();
          return [field.name, label === "" ? {} : { label }];
        }),
    );
  }

  /** An asked field left empty has no default, which is absence rather than an empty string. */
  function argumentsFor(
    asks: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(valuesFrom(typeable, typed)).filter(
        ([field, value]) => !(field in asks) || value !== "",
      ),
    );
  }

  async function save() {
    if (busy || unnamed) return;
    busy = true;
    said = "";

    const asks = asking();
    const wanted = {
      name: name.trim(),
      destination,
      capability,
      arguments: argumentsFor(asks),
      asked: asks,
      // A capability with no folders has nothing to establish, and a mode left
      // over from the one chosen before would be refused as an argument.
      folder: folders ? folder : ("create" as const),
      triggerTag:
        tag.trim() === "" ? undefined : `${TRIGGER_NAMESPACE}${tag.trim()}`,
    };

    try {
      if (editing === undefined) {
        await client.templates.create({
          name: wanted.name,
          destination: wanted.destination,
          capability: wanted.capability,
          arguments: wanted.arguments,
          ...(Object.keys(wanted.asked).length === 0
            ? {}
            : { asked: wanted.asked }),
          folder: wanted.folder,
          ...(wanted.triggerTag === undefined
            ? {}
            : { triggerTag: wanted.triggerTag }),
        });
      } else {
        await client.templates.update(editing.id, {
          ...wanted,
          // `null` is the one thing absence cannot say: take the tag off.
          triggerTag: wanted.triggerTag ?? null,
        });
      }
      saved = true;
      done();
    } catch (error) {
      said = saidBy(error);
    } finally {
      busy = false;
    }
  }

  const begun = untrack(() =>
    JSON.stringify([name, tag, destination, capability, folder, typed, asked]),
  );
  let saved = false;
  const changed = (): boolean =>
    !saved &&
    JSON.stringify([
      name,
      tag,
      destination,
      capability,
      folder,
      typed,
      asked,
    ]) !== begun;

  /** Why it cannot be saved yet, said over Save. */
  const missing = $derived(
    disabled
      ? "The pool is out of reach."
      : unnamed
        ? "Name it to save."
        : destination === ""
          ? "Pick a destination to save."
          : undefined,
  );

  headed(() => ({
    title: editing === undefined ? "new template" : "edit template",
    trail: trailTo("templates", editing),
    out: { icon: "close", label: "Cancel", run: done },
  }));
</script>

<Guard about={editing?.name ?? "a new template"} {changed} />

<form
  onsubmit={(event) => {
    event.preventDefault();
    void save();
  }}
>
  <Band>template</Band>
  <label class="block border-b border-rule px-gutter py-3">
    <span class="mb-1.5 block text-small">name</span>
    <input
      bind:this={nameField}
      bind:value={name}
      aria-label="name"
      aria-describedby={unnamed ? `${id}-unnamed` : undefined}
      placeholder="what it is called when routing"
      class="min-h-11 w-full rounded-control border border-edge bg-paper px-3 outline-none focus:border-ink"
    />
    {#if unnamed}
      <span id={`${id}-unnamed`} class="sr-only">a template needs a name</span>
    {/if}
  </label>

  <label class="block border-b border-rule px-gutter py-3">
    <span class="mb-1.5 block text-small">trigger tag (optional)</span>
    <span
      class="flex min-h-11 items-center rounded-control border border-edge bg-paper px-3 focus-within:border-ink"
    >
      <span aria-hidden="true" class="text-muted">#{TRIGGER_NAMESPACE}</span>
      <input
        bind:value={tag}
        aria-label="trigger tag"
        class="min-w-0 flex-1 bg-transparent outline-none"
      />
    </span>
    <span class="mt-1.5 block text-small text-muted">
      An item tagged with it is routed by this template. Left blank, the
      template is only picked when routing.
    </span>
  </label>

  <Band>where</Band>
  <RadioRows
    label="destination"
    value={destination === "" ? undefined : destination}
    options={destinations.map((one) => ({
      value: one.id,
      word: one.name,
      line: `${kindName(one.kind)}${one.retired === true ? ", disabled" : ""}`,
    }))}
    onchoose={(one) => (destination = one)}
  />

  {#if offersOutput || !(offersOutput && assetsOnly)}
    <Band>how</Band>
    {#if offersOutput}
      <div class="border-b border-rule px-gutter py-3">
        <span class="mb-1.5 block text-small">output</span>
        <Segmented
          label="output"
          value={assetsOnly ? "assets" : "everything"}
          options={[
            { value: "everything", word: "Everything" },
            { value: "assets", word: "Attachments only" },
          ]}
          onchoose={(one) => output(one === "assets")}
        />
      </div>
    {/if}
    {#if !(offersOutput && assetsOnly)}
      <div class="border-b border-rule px-gutter py-3">
        <span class="mb-1.5 block text-small">action</span>
        <Segmented
          label="action"
          value={capability === "" ? undefined : capability}
          options={(offersOutput ? actions : capabilities).map((one) => ({
            value: one.name,
            word: actionOf(one.name),
          }))}
          onchoose={(one) => (capability = one)}
        />
      </div>
    {/if}
  {/if}

  {#if typeable.length > 0}
    <Band>place</Band>
  {/if}
  {#each typeable as field (field.name)}
    <div class="border-b border-rule px-gutter py-3">
      <div class="mb-1.5 flex items-center justify-between gap-3">
        <span class="text-small">{labelFor(field)}</span>
        {#if askable(field)}
          <span class="flex-none" title={`ask ${labelFor(field)} each time`}>
            <Toggle
              small
              label={`ask ${labelFor(field)} each time`}
              on={Object.hasOwn(asked, field.name)}
              ontoggle={() => ask(field.name)}>Ask each time</Toggle
            >
          </span>
        {/if}
      </div>
      {#if Object.hasOwn(asked, field.name)}
        <!-- Asked each time: the question it is asked as, then what it is
             when the question is left unanswered. -->
        <label class="mb-3 block">
          <span class="mb-1 block text-small text-muted">asked as</span>
          <input
            bind:value={asked[field.name]}
            aria-label={`${labelFor(field)} label`}
            placeholder={`which ${labelFor(field)}?`}
            class="min-h-11 w-full rounded-control border border-edge bg-paper px-3 outline-none focus:border-ink"
          />
        </label>
        <span class="mb-1 block text-small text-muted">default</span>
      {/if}
      {#if fixed(field) !== undefined}
        {@const implied =
          (typed[field.name] ?? "") === ""
            ? impliedOf(field, inherited)
            : undefined}
        <Segmented
          label={labelFor(field)}
          value={(typed[field.name] ?? "") === "" ? implied : typed[field.name]}
          options={(fixed(field) ?? []).map((one) => ({
            value: one,
            word: wordFor(field.name, labelOf(field, one)),
          }))}
          onchoose={(one) => (typed[field.name] = one)}
        />
      {:else if field.listable && destination !== "" && field.path !== undefined}
        <!-- No forecast and no remembered continuation: a pattern names no
             one note, so neither has anything to read off it. -->
        <PathLine
          {destination}
          {capability}
          field={field.name}
          label={labelFor(field)}
          value={typed[field.name] ?? ""}
          claims={false}
          onchange={(value) => (typed[field.name] = value)}
        />
      {:else if field.listable && destination !== ""}
        <!-- `durable`: a template sits on a tag for months, and a value that
             rots takes the template with it. -->
        <CandidateBrowser
          {destination}
          {capability}
          field={field.name}
          label={labelFor(field)}
          value={typed[field.name] ?? ""}
          durable
          naming={field.offeredOnly}
          offeredOnly={field.offeredOnly}
          given={givenFor(field, typed)}
          claims={false}
          onchange={(value) => (typed[field.name] = value)}
        />
      {:else}
        <input
          bind:value={typed[field.name]}
          aria-label={labelFor(field)}
          aria-describedby={undefaulted(field)}
          placeholder={Object.hasOwn(asked, field.name)
            ? "no default"
            : field.required
              ? "required"
              : "optional"}
          class="min-h-11 w-full rounded-control border border-edge bg-paper px-3 outline-none focus:border-ink"
        />
      {/if}
      {#if undefaulted(field) !== undefined && (fixed(field) !== undefined || field.listable)}
        <!-- Only the template's own value is a default: a destination's setting is not. -->
        <p id={undefaulted(field)} class="mt-1.5 mb-0 text-small text-muted">
          no default
        </p>
      {/if}
      <!-- Said once, terse: what each comes out as is the pool's answer. -->
      {#if field.name === patterned}
        <!-- Named from the item: each word puts its pattern at the end. -->
        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <span class="text-small text-muted">name from</span>
          {#each PATTERNS as one (one.pattern)}
            <button
              type="button"
              title={one.pattern}
              onclick={() =>
                (typed[field.name] =
                  `${typed[field.name] ?? ""}${one.pattern}`)}
              class="inline-flex min-h-8 items-center rounded-control border border-off-line bg-off px-2.5 text-small active:bg-off-down"
              >+ {one.word}</button
            >
          {/each}
        </div>
      {/if}
    </div>
  {/each}

  {#if starting?.rewriteLeft === true}
    <p class="m-0 border-b border-rule px-gutter py-3 text-small text-muted">
      The rewrite stays with its item: a template files each item's own words.
    </p>
  {/if}

  {#if folders}
    <Band level={3}>if the folder is missing</Band>
    <RadioRows
      label="if missing"
      value={folder}
      options={FOLDERS.map((one) => ({
        value: one.name,
        word: one.word,
        line: one.note,
      }))}
      onchoose={(one) => (folder = one)}
    />
  {/if}

  {#if said !== ""}
    <p role="status" class="m-0 px-gutter py-3 text-danger">{said}</p>
  {/if}
</form>

<FormBar {missing} {busy} oncancel={done} onsave={() => void save()} />
