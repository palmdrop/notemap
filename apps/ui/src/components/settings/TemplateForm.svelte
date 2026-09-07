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
  import { client } from "$lib/client";
  import {
    fieldsOf,
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
    { name: "create", why: "make it if missing" },
    { name: "require", why: "refuse if missing" },
    { name: "establish", why: "make once, require after" },
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

  const fields = $derived(
    fieldsOf(
      capabilities.find((one) => one.name === capability)?.argumentsSchema,
    ),
  );

  /**
   * A folder mode is the template's own, said in its own words below, so the
   * schema's field is not drawn twice.
   */
  const typeable = $derived(fields.filter((one) => one.name !== "folder"));

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

<div class="mt-6 border-l-2 border-l-ink bg-ink/3 px-5 pt-4 pb-5">
  <div class="tracking-[0.3em] text-ink-muted uppercase">
    {editing === undefined ? "A new template" : "Editing"}
  </div>

  <div class="mt-4">
    <div class="text-ink-muted">name</div>
    <input
      bind:value={name}
      aria-label="name"
      class="mt-0.5 w-full border-0 border-b border-b-ink bg-transparent px-0 py-0.5 outline-none"
    />
  </div>

  <div class="mt-4">
    <div class="text-ink-muted">trigger tag</div>
    <div class="mt-0.5 flex items-baseline border-b border-b-ink">
      <span aria-hidden="true" class="text-ink-muted">{NAMESPACE}</span>
      <input
        bind:value={tag}
        aria-label="trigger tag"
        class="w-full border-0 bg-transparent px-0 py-0.5 outline-none"
      />
    </div>
  </div>

  <div class="mt-4">
    <div class="text-ink-muted">destination</div>
    <div class="mt-0.5">
      {#each destinations as one (one.id)}
        <Option
          label={one.name}
          chosen={destination === one.id}
          why={one.retired === true ? "retired" : undefined}
          onchoose={() => (destination = one.id)}
        />
      {/each}
    </div>
  </div>

  <div class="mt-4">
    <div class="text-ink-muted">action</div>
    <div class="mt-0.5">
      {#each capabilities as one (one.name)}
        <Option
          label={one.name}
          chosen={capability === one.name}
          onchoose={() => (capability = one.name)}
        />
      {/each}
    </div>
  </div>

  {#each typeable as field (field.name)}
    <div class="mt-4">
      <div class="text-ink-muted">{field.title ?? field.name}</div>
      {#if fixed(field) !== undefined}
        <div class="mt-0.5">
          {#each fixed(field) ?? [] as one (one)}
            <Option
              label={one}
              chosen={typed[field.name] === one}
              onchoose={() => (typed[field.name] = one)}
            />
          {/each}
        </div>
      {:else}
        <input
          bind:value={typed[field.name]}
          aria-label={field.title ?? field.name}
          placeholder={field.required ? "required" : "optional"}
          class="mt-0.5 w-full border-0 border-b border-b-ink bg-transparent px-0 py-0.5 outline-none placeholder:text-ink-muted"
        />
      {/if}
    </div>
  {/each}

  <!-- Said once, terse, rather than a paragraph per pattern: what each comes
       out as is the pool's answer, and the pool refuses one it does not know.
       Only where something can hold one: a form of nothing but chosen fields
       has nowhere to put a pattern. -->
  {#if typeable.some((field) => fixed(field) === undefined)}
    <p class="mt-2 text-ink-muted">
      {"{{captured_at}} · {{captured_at:month}} · {{captured_at:week}} · {{item}} · {{source}}"}
    </p>
  {/if}

  {#if folders}
    <div class="mt-4">
      <div class="text-ink-muted">folder</div>
      <div class="mt-0.5">
        {#each FOLDERS as one (one.name)}
          <Option
            label={one.name}
            why={one.why}
            chosen={folder === one.name}
            onchoose={() => (folder = one.name)}
          />
        {/each}
      </div>
    </div>
  {/if}

  {#if said !== ""}
    <p role="status" class="mt-3 text-accent">{said}</p>
  {/if}

  <div class="mt-6 flex flex-wrap items-baseline gap-x-6">
    <Action disabled={disabled || busy} onclick={() => void save()}>
      <span class="inverted">Save</span>
    </Action>
    <Action onclick={done}><span class="text-ink-muted">Cancel</span></Action>
  </div>
</div>
