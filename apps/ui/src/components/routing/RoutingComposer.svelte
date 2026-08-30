<script lang="ts">
  import {
    saidBy,
    type Capability,
    type DestinationDescription,
  } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import Commit from "$components/primitives/composer/Commit.svelte";
  import Group from "$components/primitives/composer/Group.svelte";
  import Modal from "$components/primitives/composer/Modal.svelte";
  import Option from "$components/primitives/composer/Option.svelte";
  import { client } from "$lib/client";
  import { fieldsOf, valuesFrom } from "$lib/schema-form";

  let {
    item,
    subject,
    onclose,
  }: {
    item: string;
    /** What the row said, since the row itself is now behind the veil. */
    subject: string;
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

  async function send() {
    if (chosen === undefined || capability === undefined) return;

    busy = true;
    said = "routing…";
    try {
      await client.routing.route(item, {
        destination: chosen,
        capability,
        arguments: valuesFrom(fields, args),
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
    <Group name={field.name}>
      <input
        bind:value={args[field.name]}
        placeholder={field.required ? "required" : "optional"}
        aria-label={field.name}
        class="w-full border-b border-ink bg-transparent font-mono placeholder:text-ink-muted"
      />
    </Group>
  {/each}

  <Commit>
    <Action primary disabled={!ready || busy} onclick={send}>route</Action>
    <Action onclick={onclose}>cancel</Action>
    {#if said !== ""}
      <span role="status" class="text-ink-muted">{said}</span>
    {/if}
  </Commit>
</Modal>
