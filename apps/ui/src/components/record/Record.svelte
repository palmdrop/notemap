<script lang="ts">
  import {
    saidBy,
    type DestinationDescription,
    type RoutingRecord,
  } from "@notemap/client";

  import { itemHref } from "$components/item/href";
  import Body from "$components/primitives/register/Body.svelte";
  import Fact from "$components/primitives/register/Fact.svelte";
  import Facts from "$components/primitives/register/Facts.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import { argumentsOf } from "$lib/arguments";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";
  import { NO_RECORDS_OFFLINE, NO_SUCH_RECORD } from "$lib/said";

  let { item: id, record: wanted }: { item: string; record: string } = $props();

  const pool = reachable();
  const destinations = client.destinations.all;

  let records = $state<readonly RoutingRecord[] | undefined>(undefined);
  let refused = $state("");
  let described = $state<DestinationDescription | undefined>(undefined);

  const held = $derived(client.held(id));
  const item = $derived($held);

  // The item is read so this surface can say what the record is about; what it
  // says comes from whatever the client holds afterwards.
  $effect(() => {
    void client.item(id);
  });

  // Nothing caches a record, so this surface has the pool or it has nothing.
  $effect(() => {
    if (!pool.yes) return;

    const asking = id;
    void (async () => {
      try {
        const answered = await client.routing.recordsFor(asking);
        if (asking === id) records = answered;
      } catch (error) {
        if (asking === id) refused = saidBy(error);
      }
    })();
  });

  const record = $derived(records?.find((one) => one.id === wanted));
  const target = $derived(record?.target);

  $effect(() => {
    if (target === undefined || target.kind !== "destination") return;

    const asking = target.destination;
    void (async () => {
      try {
        described = await client.destinations.describe(asking);
      } catch {
        // A destination that cannot be described is drawn by its own keys,
        // which is the honest fallback rather than a failure of this surface.
        described = undefined;
      }
    })();
  });

  const capability = $derived(
    described?.kind === "described" &&
      target !== undefined &&
      target.kind === "destination"
      ? described.capabilities.find((one) => one.name === target.capability)
      : undefined,
  );

  const given = $derived(
    target !== undefined && target.kind === "destination"
      ? argumentsOf(target.arguments, capability?.argumentsSchema)
      : [],
  );

  /** Marking processed is routing whose destination is the person, so it names one. */
  const destination = $derived(
    target !== undefined && target.kind === "destination"
      ? ($destinations.find((one) => one.id === target.destination)?.name ??
          "a destination")
      : "the user",
  );

  const said = $derived(item === undefined ? "" : client.says(item));
</script>

<Register>
  {#if record !== undefined && target !== undefined}
    <Rail first>
      <Stamp at={record.at} />
      <StateWord word={record.state} />

      <Facts>
        <Fact name="destination">{destination}</Fact>
        {#if target.kind === "destination"}
          <Fact name="capability">{target.capability}</Fact>
        {/if}
        <Fact name="item"><a href={itemHref(id)}>{said || id}</a></Fact>
        <Fact name="record">{record.id}</Fact>
      </Facts>
    </Rail>

    <Body first>
      {#if target.kind === "destination"}
        <div class="font-mono text-ink-muted">arguments</div>
        {#if given.length === 0}
          <div class="mt-2 font-mono text-ink-muted">none</div>
        {:else}
          <Facts>
            {#each given as argument (argument.name)}
              <Fact name={argument.name} empty={argument.said === ""}>
                {argument.said === "" ? "blank" : argument.said}
              </Fact>
            {/each}
          </Facts>
        {/if}
      {:else if target.note !== undefined}
        <div class="font-mono text-ink-muted">note</div>
        <div class="mt-2 break-words">{target.note}</div>
      {/if}

      <div class="mt-6 font-mono text-ink-muted">pointer</div>
      <!-- Text, never a link: the shell never guesses whether a string is a URL. -->
      <div class="mt-2 font-mono break-words">
        {#if record.pointer === undefined}
          <span class="text-ink-muted">not recorded</span>
        {:else}
          {record.pointer}
        {/if}
      </div>
    </Body>
  {:else}
    <Rail first>
      {#if records !== undefined}
        <StateWord word="gone" />
      {/if}

      <Facts>
        <Fact name="item"><a href={itemHref(id)}>{said || id}</a></Fact>
      </Facts>
    </Rail>
    <Body first>
      {#if refused !== ""}
        <div role="status" class="font-mono text-accent">{refused}</div>
      {:else if records !== undefined}
        <Prose text={NO_SUCH_RECORD} />
      {:else if !pool.yes}
        <div class="font-mono text-ink-muted">{NO_RECORDS_OFFLINE}</div>
      {/if}
    </Body>
  {/if}
</Register>
