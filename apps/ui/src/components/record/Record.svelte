<script lang="ts">
  import Output from "$components/routing/Output.svelte";
  import { itemHref } from "$components/item/href";
  import Body from "$components/primitives/register/Body.svelte";
  import Fact from "$components/primitives/register/Fact.svelte";
  import Facts from "$components/primitives/register/Facts.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import { didWhat } from "$lib/capability";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";
  import { recordsOf } from "$lib/records.svelte";
  import { followable } from "$lib/link";
  import {
    NO_OUTPUT_KEPT,
    NO_POINTER_BY_HAND,
    NO_POINTER_KEPT,
    NO_RECORDS_OFFLINE,
    NO_SUCH_RECORD,
    OUTPUT_UNREADABLE,
    THIS_ITEM,
    WORDS_WERE_ITS_OWN,
  } from "$lib/said";
  import { saidBy, saidOf } from "@notemap/client";

  let { item: id, record: wanted }: { item: string; record: string } = $props();

  const pool = reachable();
  const destinations = client.destinations.all;

  const records = recordsOf(
    () => id,
    () => pool.yes,
  );

  const record = $derived(records.all.find((one) => one.id === wanted));
  const target = $derived(record?.target);

  /** Marking processed is routing whose destination is the person, so it names one. */
  const destination = $derived(
    target !== undefined && target.kind === "destination"
      ? ($destinations.find((one) => one.id === target.destination)?.name ??
          "a destination")
      : "the user",
  );

  /**
   * The words this delivery carried, where they were not the capture's. What
   * the item says is a link on the rail and says what it says now; this is what
   * went, which is the question a record is opened with.
   */
  const carried = $derived(
    target?.kind === "destination" && target.content !== undefined
      ? saidOf(target.content)
      : undefined,
  );

  const link = $derived(followable(record?.url));

  let output = $state<string | undefined>(undefined);
  let reading = $state(false);
  let unreadable = $state("");

  // The page component is reused across a change of record, so what was read
  // for one would otherwise be drawn as what the next one sent.
  $effect(() => {
    void wanted;
    output = undefined;
    unreadable = "";
  });

  /**
   * Read on arrival: whoever opened a record came to see what was sent. Still a
   * fetch rather than something the record carries, so nothing pays for it
   * until this surface is the one being drawn — and a read that failed is not
   * tried again on its own, the guards below being what stops the loop.
   */
  $effect(() => {
    if (record?.output?.content === undefined) return;
    if (output !== undefined || unreadable !== "" || reading) return;
    void read();
  });

  const saidAboutOutput = $derived(
    record?.output?.content === undefined && record?.output?.note === undefined
      ? NO_OUTPUT_KEPT
      : unreadable,
  );

  async function read() {
    if (record === undefined) return;

    const asked = wanted;
    reading = true;
    unreadable = "";
    try {
      const bytes = await client.routing.output(record.id);
      if (asked === wanted) output = bytes;
    } catch (error) {
      if (asked === wanted)
        unreadable = `${OUTPUT_UNREADABLE} ${saidBy(error)}`;
    } finally {
      reading = false;
    }
  }
</script>

<Register>
  {#if record !== undefined && target !== undefined}
    <Rail>
      <Stamp at={record.at} />

      <!-- A record that is not saying otherwise was delivered. -->
      {#if record.state !== "delivered"}
        <StateWord word={record.state} />
      {/if}

      <div class="mt-2 break-words">
        {target.kind === "destination"
          ? didWhat(target.capability)
          : "Marked done by hand"}
      </div>

      <!-- The destination and the place inside it, adjacent: one address in
           two parts. A link only where the destination offered one — the
           shell never guesses whether a string is a URL. -->
      <Facts>
        <Fact name="destination">{destination}</Fact>
        <Fact name="place">
          {#if record.pointer === undefined}
            {target.kind === "user" ? NO_POINTER_BY_HAND : NO_POINTER_KEPT}
          {:else if link === undefined}
            {record.pointer}
          {:else}
            <a href={link} rel="noreferrer">{record.pointer}</a>
          {/if}
        </Fact>
        <Fact name="item">
          <a href={itemHref(id)}>{THIS_ITEM}</a>
        </Fact>
      </Facts>
    </Rail>

    <Body>
      <div class="font-semibold tracking-caps uppercase">routing record</div>

      {#if target.kind === "user" && target.note !== undefined}
        <div class="mt-6 tracking-caps uppercase">note</div>
        <div class="mt-2 break-words">{target.note}</div>
      {/if}

      {#if carried !== undefined}
        <div class="mt-6 tracking-caps uppercase">words</div>
        <div class="mt-2 break-words whitespace-pre-wrap">{carried}</div>
        <div class="mt-2">{WORDS_WERE_ITS_OWN}</div>
      {/if}

      <div class="mt-6">
        <Output
          note={record.output?.note}
          text={output}
          said={saidAboutOutput}
          onread={record.output?.content === undefined ? undefined : read}
          busy={reading}
        />
      </div>
    </Body>
  {:else}
    <Rail>
      {#if records.settled && records.refused === ""}
        <StateWord word="gone" />
      {/if}

      <Facts>
        <Fact name="item">
          <a href={itemHref(id)}>{THIS_ITEM}</a>
        </Fact>
      </Facts>
    </Rail>
    <Body>
      {#if records.refused !== ""}
        <div role="status" class="text-alarm">{records.refused}</div>
      {:else if records.settled}
        <Prose text={NO_SUCH_RECORD} />
      {:else if !pool.yes}
        <div>{NO_RECORDS_OFFLINE}</div>
      {/if}
    </Body>
  {/if}
</Register>
