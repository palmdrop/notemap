<script lang="ts">
  import { untrack } from "svelte";

  import {
    saidBy,
    type Capability,
    type Destination,
    type RoutingTemplate,
  } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import Option from "$components/primitives/composer/Option.svelte";
  import CandidateBrowser from "$components/routing/CandidateBrowser.svelte";
  import { OWN_ARGUMENTS } from "$lib/arguments";
  import { client } from "$lib/client";
  import {
    effectiveOf,
    fieldsOf,
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
    disabled,
    done,
  }: {
    destinations: readonly Destination[];
    editing?: RoutingTemplate;
    disabled: boolean;
    done: () => void;
  } = $props();

  /** The namespace a trigger tag lives in. Not typed: it is what marks one. */
  const NAMESPACE = "route/";

  const FOLDERS = [
    { name: "create", note: "make it if missing" },
    { name: "require", note: "refuse if missing" },
    { name: "establish", note: "make once, require after" },
  ] as const;

  // Where the form starts, not what it holds: nothing changes under a typist.
  let name = $state(untrack(() => editing?.name ?? ""));
  let tag = $state(
    untrack(() => editing?.triggerTag?.slice(NAMESPACE.length) ?? ""),
  );
  let destination = $state(
    untrack(() => editing?.destination ?? destinations[0]?.id ?? ""),
  );
  let capability = $state(untrack(() => editing?.capability ?? ""));
  let folder = $state(untrack(() => editing?.folder ?? "create"));
  let typed = $state(untrack(() => typedFrom(editing?.arguments)));

  let capabilities = $state<readonly Capability[]>([]);
  let said = $state("");
  let busy = $state(false);

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

  async function save() {
    if (busy) return;
    busy = true;
    said = "";

    const wanted = {
      name: name.trim(),
      destination,
      capability,
      arguments: valuesFrom(typeable, typed),
      // A capability with no folders has nothing to establish, and a mode left
      // over from the one chosen before would be refused as an argument.
      folder: folders ? folder : ("create" as const),
      triggerTag: tag.trim() === "" ? undefined : `${NAMESPACE}${tag.trim()}`,
    };

    try {
      if (editing === undefined) {
        await client.templates.create({
          name: wanted.name,
          destination: wanted.destination,
          capability: wanted.capability,
          arguments: wanted.arguments,
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
      done();
    } catch (error) {
      said = saidBy(error);
    } finally {
      busy = false;
    }
  }
</script>

<form
  onsubmit={(event) => {
    event.preventDefault();
    void save();
  }}
  class="mt-5 grid grid-cols-[9rem_1fr] gap-y-1.5 pt-3 max-narrow:grid-cols-1"
>
  <span class="tracking-caps uppercase max-narrow:mt-1.5">name</span>
  <input
    bind:value={name}
    aria-label="name"
    class="w-full border-b border-ink bg-transparent px-0 py-0.5 outline-none"
  />

  <span class="tracking-caps uppercase max-narrow:mt-1.5">trigger tag</span>
  <div class="flex items-baseline border-b border-ink">
    <span aria-hidden="true">{NAMESPACE}</span>
    <input
      bind:value={tag}
      aria-label="trigger tag"
      class="w-full border-0 bg-transparent px-0 py-0.5 outline-none"
    />
  </div>

  <span class="tracking-caps uppercase max-narrow:mt-1.5">destination</span>
  <div class="flex flex-wrap gap-x-[2ch]">
    {#each destinations as one (one.id)}
      <Option
        label={one.name}
        chosen={destination === one.id}
        why={one.retired === true ? "disabled" : undefined}
        onchoose={() => (destination = one.id)}
      />
    {/each}
  </div>

  <span class="tracking-caps uppercase max-narrow:mt-1.5">action</span>
  <div class="flex flex-wrap gap-x-[2ch]">
    {#each capabilities as one (one.name)}
      <Option
        label={one.name}
        chosen={capability === one.name}
        onchoose={() => (capability = one.name)}
      />
    {/each}
  </div>

  {#each typeable as field (field.name)}
    <span class="tracking-caps uppercase max-narrow:mt-1.5">
      {field.title ?? field.name}
    </span>
    <div>
      {#if fixed(field) !== undefined}
        <!-- Taking the option already taken gives it back: absent inherits,
             and the hollow mark says what that comes out as. -->
        {@const implied =
          (typed[field.name] ?? "") === ""
            ? impliedOf(field, inherited)
            : undefined}
        <div class="flex flex-wrap gap-x-[2ch]">
          {#each fixed(field) ?? [] as one (one)}
            <Option
              label={labelOf(field, one)}
              chosen={typed[field.name] === one}
              implied={implied === one}
              onchoose={() =>
                (typed[field.name] = typed[field.name] === one ? "" : one)}
            />
          {/each}
        </div>
      {:else if field.askable && destination !== ""}
        <!--
          The schema-driven browser rather than the kind's own control: what a
          template holds is a pattern, and the typed path line beside it
          forecasts create-against-append for a path that does not exist yet.
          The browser carries the field's own input, so a place that has to be
          picked from what is there and one that has to be written are the same
          field.

          `durable`, because this is the decision that fires again: a template
          sits on a tag for months, and a value that rots takes the template
          with it. Where a destination offers no second name for a thing this
          changes nothing.

          And read by name where the field may hold only what was offered,
          which is where that lasting form is an id: the person picked a
          channel, not a number, and the form is the only thing that can say
          which one it was.
        -->
        <CandidateBrowser
          {destination}
          {capability}
          field={field.name}
          label={field.title ?? field.name}
          value={typed[field.name] ?? ""}
          durable
          naming={field.offeredOnly}
          onchange={(value) => (typed[field.name] = value)}
        />
      {:else}
        <input
          bind:value={typed[field.name]}
          aria-label={field.title ?? field.name}
          placeholder={field.required ? "required" : "optional"}
          class="w-full border-b border-ink bg-transparent px-0 py-0.5 outline-none"
        />
      {/if}
    </div>
    <!-- Said once, terse, rather than a paragraph per pattern: what each comes
         out as is the pool's answer, and the pool refuses one it does not know. -->
    {#if field.name === patterned}
      <span></span>
      <p class="col-start-2 max-narrow:col-start-1">
        {"{{captured_at}} · {{captured_at:month}} · {{captured_at:week}} · {{item}} · {{source}}"}
      </p>
    {/if}
  {/each}

  {#if folders}
    <span class="tracking-caps uppercase max-narrow:mt-1.5">folder</span>
    <div class="grid grid-cols-[max-content_1fr] items-baseline gap-x-[2ch]">
      {#each FOLDERS as one (one.name)}
        <Option
          label={one.name}
          chosen={folder === one.name}
          onchoose={() => (folder = one.name)}
        />
        <span>{one.note}</span>
      {/each}
    </div>
  {/if}

  <div
    class="col-span-2 mt-3.5 flex items-center justify-between border-t border-ink pt-2.5 max-narrow:col-span-1"
  >
    <Action onclick={done}>cancel</Action>
    <span class="inverted">
      <Action disabled={disabled || busy} onclick={() => void save()}>
        save
      </Action>
    </span>
  </div>

  {#if said !== ""}
    <p role="status" class="col-span-2 text-alarm max-narrow:col-span-1">
      {said}
    </p>
  {/if}
</form>
