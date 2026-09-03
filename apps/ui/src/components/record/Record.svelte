<script lang="ts">
  import type { DestinationDescription } from "@notemap/client";

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
  import { didWhat } from "$lib/capability";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";
  import { recordsOf } from "$lib/records.svelte";
  import { NO_RECORDS_OFFLINE, NO_SUCH_RECORD, THIS_ITEM } from "$lib/said";

  let { item: id, record: wanted }: { item: string; record: string } = $props();

  const pool = reachable();
  const destinations = client.destinations.all;

  let described = $state<DestinationDescription | undefined>(undefined);

  const held = $derived(client.held(id));
  const item = $derived($held);

  // The item is read so this surface can say what the record is about; what it
  // says comes from whatever the client holds afterwards.
  $effect(() => {
    void client.item(id);
  });

  const records = recordsOf(
    () => id,
    () => pool.yes,
  );

  const record = $derived(records.all.find((one) => one.id === wanted));
  const target = $derived(record?.target);

  $effect(() => {
    described = undefined;
    if (target === undefined || target.kind !== "destination") return;

    const asking = target.destination;
    void (async () => {
      try {
        const answer = await client.destinations.describe(asking);
        if (target?.kind === "destination" && asking === target.destination) {
          described = answer;
        }
      } catch {
        // A destination that cannot be described is drawn by its own keys,
        // which is the honest fallback rather than a failure of this surface.
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

      <div class="mt-2 break-words">
        {target.kind === "destination"
          ? didWhat(target.capability)
          : "Marked done by hand"}
      </div>

      <Facts>
        <Fact name="where">{destination}</Fact>
        <Fact name="item">
          <a href={itemHref(id)}>{said || THIS_ITEM}</a>
        </Fact>
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
      {:else}
        <div class="font-mono text-ink-muted">note</div>
        {#if target.note === undefined}
          <div class="mt-2 font-mono text-ink-muted">none</div>
        {:else}
          <div class="mt-2 break-words">{target.note}</div>
        {/if}
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
      {#if records.settled && records.refused === ""}
        <StateWord word="gone" />
      {/if}

      <Facts>
        <Fact name="item">
          <a href={itemHref(id)}>{said || THIS_ITEM}</a>
        </Fact>
      </Facts>
    </Rail>
    <Body first>
      {#if records.refused !== ""}
        <div role="status" class="font-mono text-accent">{records.refused}</div>
      {:else if records.settled}
        <Prose text={NO_SUCH_RECORD} />
      {:else if !pool.yes}
        <div class="font-mono text-ink-muted">{NO_RECORDS_OFFLINE}</div>
      {/if}
    </Body>
  {/if}
</Register>
