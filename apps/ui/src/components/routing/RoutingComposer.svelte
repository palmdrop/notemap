<script lang="ts">
  import {
    saidBy,
    type Capability,
    type DestinationDescription,
  } from "@notemap/client";

  import ComposerTags from "$components/routing/ComposerTags.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import Commit from "$components/primitives/composer/Commit.svelte";
  import Group from "$components/primitives/composer/Group.svelte";
  import Modal from "$components/primitives/composer/Modal.svelte";
  import Option from "$components/primitives/composer/Option.svelte";
  import { placeOf } from "@notemap/output-markdown/naming";

  import { browserFor } from "$lib/candidate-browsers";
  import { client } from "$lib/client";
  import { fieldsOf, valuesFrom } from "$lib/schema-form";

  const CREATE_FILE = "create-file";
  /** The one field the typed line drives, and the only one `⇧⏎` has to re-read. */
  const LINE_FIELD = "path";

  let {
    item,
    subject,
    content,
    tags = [],
    onclose,
  }: {
    item: string;
    /** What the row said, since the row itself is now behind the veil. */
    subject: string;
    /** The item's own payload, from which the name of an unnamed note is derived. */
    content?: unknown;
    /** What the item already carries, so the composer's own row draws them as taken. */
    tags?: readonly string[];
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

  const ready = $derived(chosen !== undefined && capability !== undefined);

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
      await client.routing.route(item, {
        destination: chosen,
        ...(beside === undefined
          ? { capability, arguments: valuesFrom(fields, args) }
          : freshFile(beside)),
      });
      onclose();
    } catch (error) {
      said = saidBy(error);
    } finally {
      busy = false;
    }
  }
</script>

<Modal title="route" {subject} {onclose}>
  <!-- Above `where` is where a decision that arrived pre-filled with an
       attribution goes. Nothing produces that shape yet. -->

  <Group name="where">
    {#each $destinations as one (one.id)}
      <Option
        label={one.name}
        chosen={chosen === one.id}
        why={reasonFor(one.id, one.retired === true)}
        onchoose={() => void choose(one.id)}
      />
    {/each}
  </Group>

  {#if capabilities.length > 0}
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

  {#each fields as field (field.name)}
    <Group name={field.title ?? field.name}>
      {#if field.description !== undefined}
        <p class="mb-1 text-ink-muted">{field.description}</p>
      {/if}
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
        />
      {:else}
        <input
          bind:value={args[field.name]}
          placeholder={field.required ? "required" : "optional"}
          aria-label={field.title ?? field.name}
          class="mt-1.5 w-full border-b border-ink bg-transparent font-mono placeholder:text-ink-muted"
        />
      {/if}
    </Group>
  {/each}

  <ComposerTags {item} names={tags} />

  <Commit>
    <Action primary disabled={!ready || busy} onclick={() => void send()}
      >route</Action
    >
    <Action onclick={onclose}>cancel</Action>
    {#if said !== ""}
      <span role="status" class="text-ink-muted">{said}</span>
    {/if}
  </Commit>
</Modal>
