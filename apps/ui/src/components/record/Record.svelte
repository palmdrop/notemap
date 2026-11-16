<script lang="ts">
  import { goto } from "$app/navigation";
  import { saidBy, type Action, type Presence } from "@notemap/client";

  import { itemHref } from "$components/item/href";
  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";
  import Band from "$components/primitives/blocks/Band.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import Facts from "$components/primitives/rows/Facts.svelte";
  import LinkRow from "$components/primitives/rows/LinkRow.svelte";
  import StateBox from "$components/primitives/rows/StateBox.svelte";
  import Dialog from "$components/primitives/sheets/Dialog.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import { templateFromHref } from "$components/settings/href";
  import { copyable } from "$lib/clipboard";
  import { client } from "$lib/client";
  import {
    capabilityHeld,
    described,
    readingHeld,
  } from "$lib/described.svelte";
  import { aboutItem } from "$lib/excerpt";
  import { callOff } from "$lib/firing";
  import { firings, left, phaseOf } from "$lib/firings.svelte";
  import { headed } from "$lib/heading.svelte";
  import { followable } from "$lib/link";
  import { nameFor } from "$lib/names.svelte";
  import { resolve } from "$lib/naming";
  import { notices } from "$lib/notices.svelte";
  import { askingToWithdraw } from "$lib/presence";
  import { reachable } from "$lib/reachable.svelte";
  import { recordsOf } from "$lib/records.svelte";
  import {
    cancelledKey,
    keyFor,
    placeIn,
    reinstatedKey,
    withdrawnKey,
  } from "$lib/routing";
  import { NO_RECORDS_OFFLINE, NO_SUCH_RECORD } from "$lib/said";
  import { fieldsOf } from "$lib/schema-form";
  import { dayOf, timeOf } from "$lib/stamp";
  import { factsOf, type Fact } from "$lib/vocabulary";

  import Written from "./Written.svelte";

  /**
   * A record's own address: where it stands, what it holds in the one
   * vocabulary, what it wrote, and Withdraw in a band of its own. The bar holds
   * the everyday ways: the item, Save as template, and Open in … where the
   * record has an address, Copy path otherwise. A delivery cancelled or given
   * up on left no record, and its page is the log's account, titled "tried".
   */
  let { item, record }: { item: string; record: string } = $props();

  const pool = reachable();
  const records = recordsOf(
    () => item,
    () => pool.yes,
  );
  const destinations = client.destinations.all;
  const templates = client.templates.all;
  const heldItem = $derived(client.held(item));

  const held = $derived(records.all.find((one) => one.id === record));

  // Reached by its own address, the item it belongs to is read for the line
  // under the head and for its attachments.
  $effect(() => {
    void client.item(item).catch(() => undefined);
  });

  /** What this view did to the record, which the record read may not say yet. */
  let changed = $state<
    | { readonly id: string; readonly withdrawnAt: string | undefined }
    | undefined
  >(undefined);
  const withdrawnAt = $derived(
    changed?.id === record ? changed.withdrawnAt : held?.withdrawnAt,
  );
  const withdrawn = $derived(withdrawnAt !== undefined);
  let reinstatable = $state(false);

  $effect(() => {
    void record;
    changed = undefined;
    reinstatable = false;
    tried = undefined;
    failed = "";
  });

  const target = $derived(held?.target);
  const byHand = $derived(target?.kind === "user");
  const to = $derived(
    target?.kind === "destination"
      ? ($destinations.find((one) => one.id === target.destination)?.name ??
          "a destination")
      : "by hand",
  );
  const kind = $derived(
    target?.kind === "destination"
      ? $destinations.find((one) => one.id === target.destination)?.kind
      : undefined,
  );

  $effect(() => {
    if (target?.kind !== "destination") return;
    const where = target;
    void described(where.destination);
    void resolve(
      where.destination,
      Object.keys(where.arguments).map((field) => ({
        capability: where.capability,
        field,
        value: String(where.arguments[field] ?? ""),
      })),
    );
  });

  const called = (field: string, value: string): string | undefined =>
    target?.kind === "destination"
      ? nameFor({
          destination: target.destination,
          capability: target.capability,
          field,
          value,
        })
      : undefined;

  const place = $derived(
    held === undefined
      ? undefined
      : placeIn(
          held,
          called,
          target?.kind === "destination"
            ? readingHeld(target.destination, target.capability)
            : undefined,
        ),
  );

  const decided = (at: string): Fact => ({
    label: "decided",
    value: `${dayOf(at)} ${timeOf(at)}`,
  });

  /** In the one vocabulary: the place where the record names one, then the rest. */
  const facts = $derived.by((): Fact[] => {
    if (held === undefined || target === undefined) return [];
    if (target.kind !== "destination") {
      return [
        { label: "destination", value: "by hand" },
        { label: "action", value: "Manual: processed by hand" },
        ...(target.note === undefined
          ? []
          : [{ label: "note", value: target.note }]),
        decided(held.at),
      ];
    }
    const fields = fieldsOf(
      capabilityHeld(target.destination, target.capability)?.argumentsSchema,
    );
    const values = Object.fromEntries(
      Object.entries(target.arguments).map(([field, value]) => [
        field,
        typeof value === "string" ? (called(field, value) ?? value) : value,
      ]),
    );
    const pathed = new Set(
      fields.filter((one) => one.path !== undefined).map((one) => one.name),
    );
    const template = held.applied?.template;
    const said = factsOf({
      destination: to,
      ...(template === undefined
        ? {}
        : {
            template:
              $templates.find((one) => one.id === template)?.name ??
              "a template",
          }),
      capability: target.capability,
      fields: fields.filter((one) => !pathed.has(one.name)),
      values: Object.fromEntries(
        Object.entries(values).filter(([field]) => !pathed.has(field)),
      ),
    });
    const [destination, ...rest] = said;
    return [
      ...(destination === undefined ? [] : [destination]),
      ...(place === undefined ? [] : [{ label: "place", value: place }]),
      ...rest,
      decided(held.at),
    ];
  });

  const link = $derived(followable(held?.url));
  const delivered = $derived(held?.state === "delivered");
  const offer = $derived(
    held !== undefined && !delivered ? firings.offer(held.id) : undefined,
  );
  const withdrawable = $derived(delivered && !byHand && !withdrawn);
  /** A route made by hand, which a template could make again. */
  const savable = $derived(
    held?.target.kind === "destination" &&
      held.applied === undefined &&
      !withdrawn,
  );

  /** Where a pending record stands, on its route in flight's terms. */
  const waiting = $derived.by(() => {
    const flying = firings.open.find((one) => one.record === record);
    if (flying === undefined) return `On its way to ${to}.`;
    const phase = phaseOf(flying, firings.now);
    const seconds = left(flying, firings.now);
    if (phase === "window") {
      return `Routing to ${to}${seconds === undefined ? "" : `, ${String(seconds)}s to cancel`}.`;
    }
    if (phase === "sending") return `Sending to ${to}.`;
    return `Waiting for ${to}: it is tried again when it answers.`;
  });

  let failed = $state("");
  let confirming = $state(false);
  let looking = $state(false);
  let presence = $state<Presence | undefined>(undefined);

  async function takeBack(what: string): Promise<void> {
    if (held === undefined) return;
    failed = "";
    try {
      await callOff(held.id, held.item);
      notices.settled(keyFor(held.id));
      notices.raise({
        what,
        key: cancelledKey(held.id),
        ...($heldItem === undefined ? {} : { about: aboutItem($heldItem) }),
      });
      records.reread();
    } catch (error) {
      failed = saidBy(error);
    }
  }

  /** Asks the destination first, so the question can say what it found. */
  async function askToWithdraw(): Promise<void> {
    const asked = record;
    failed = "";
    presence = undefined;
    confirming = true;
    looking = true;
    try {
      const found = await client.routing.presence(asked);
      if (asked === record) presence = found;
    } catch {
      // Nothing could be said, which the question says by asking plainly.
    } finally {
      if (asked === record) looking = false;
    }
  }

  async function withdraw(): Promise<void> {
    if (held === undefined) return;
    failed = "";
    try {
      const answer = await client.routing.withdraw(held.id, held.item);
      changed = { id: held.id, withdrawnAt: answer.withdrawnAt };
      reinstatable = true;
      notices.mark(withdrawnKey(held.id));
      records.reread();
    } catch (error) {
      failed = saidBy(error);
    }
  }

  async function reinstate(): Promise<void> {
    if (held === undefined) return;
    failed = "";
    try {
      await client.routing.reinstate(held.id, held.item);
      changed = { id: held.id, withdrawnAt: undefined };
      reinstatable = false;
      notices.mark(reinstatedKey(held.id));
      records.reread();
    } catch (error) {
      failed = saidBy(error);
    }
  }

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      notices.raise({ what: "Copied", subject: text });
    } catch {
      notices.raise({ what: "could not copy the path", alarm: true });
    }
  }

  /**
   * What the log says of a record the pool does not hold: the decision, and
   * how it ended. Asked only once the records are read and it is not among
   * them.
   */
  let tried = $state<readonly Action[] | undefined>(undefined);
  $effect(() => {
    if (held !== undefined || !records.settled || !pool.yes) return;
    const wanted = record;
    void client.actions
      .read({ item, order: "oldest-first" })
      .then((page) => {
        if (wanted !== record) return;
        tried = page.values.filter(
          (one) => (one.detail as Record<string, unknown>)["record"] === wanted,
        );
      })
      .catch(() => {
        if (wanted === record) tried = [];
      });
  });

  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value !== "" ? value : undefined;

  /** The log's account of a delivery that left no record. */
  const account = $derived.by(() => {
    if (tried === undefined || tried.length === 0) return undefined;
    const first = tried[0] as Action;
    const ending = tried.findLast(
      (one) =>
        one.kind === "delivery-cancelled" ||
        one.kind === "delivery-failed" ||
        one.kind === "work-abandoned",
    );
    const detail = (ending ?? first).detail as Record<string, unknown>;
    const from = first.detail as Record<string, unknown>;
    const destination =
      text(detail["destination"]) ?? text(from["destination"]);
    const capability = text(detail["capability"]) ?? text(from["capability"]);
    const template = text(detail["template"]) ?? text(from["template"]);
    const pointer = text(detail["pointer"]) ?? text(from["pointer"]);
    const name =
      destination === undefined
        ? "the destination"
        : ($destinations.find((one) => one.id === destination)?.name ??
          "a destination");
    const failure = detail["failure"];
    const why =
      typeof failure === "object" && failure !== null
        ? text((failure as Record<string, unknown>)["detail"])
        : undefined;
    const said =
      ending?.kind === "delivery-cancelled"
        ? `Cancelled. Nothing reached ${name}.`
        : `Not delivered to ${name}${why === undefined ? "." : `: ${why}`}`;
    const facts: Fact[] = factsOf({
      destination: name,
      ...(template === undefined
        ? {}
        : {
            template:
              $templates.find((one) => one.id === template)?.name ??
              "a template",
          }),
      ...(capability === undefined ? {} : { capability }),
      fields: [],
      values: {},
    });
    return {
      said,
      cancelled: ending?.kind === "delivery-cancelled",
      facts: [
        ...facts,
        ...(pointer === undefined ? [] : [{ label: "place", value: pointer }]),
        decided(first.at),
      ],
    };
  });

  const back = (): void => {
    if (history.length > 1) history.back();
    else void goto(itemHref(item));
  };

  headed(() => ({
    title: account === undefined ? "record" : "tried",
    out: { icon: "back", label: "Back", run: back },
    ...($heldItem === undefined ? {} : { under: aboutItem($heldItem) }),
  }));
</script>

{#if confirming}
  <Dialog
    title="Withdraw this record?"
    ways={[
      { label: "Keep", value: false },
      { label: "Withdraw", value: true, kind: "danger" },
    ]}
    onanswer={(yes) => {
      confirming = false;
      if (yes === true) void withdraw();
    }}
  >
    {#if looking}
      <Asking subject={to} />
    {:else}
      <p class="m-0">{askingToWithdraw(presence, kind, held?.pointer)}</p>
    {/if}
  </Dialog>
{/if}

<div class="pb-4">
  {#if held !== undefined}
    {#if withdrawn}
      <StateBox icon="link-off">
        Withdrawn{withdrawnAt === undefined
          ? ""
          : ` at ${timeOf(withdrawnAt)}`}. Nothing at {to} was touched.
      </StateBox>
    {:else if delivered}
      <StateBox tone="good" icon="check">
        {byHand ? "Processed by hand." : `Delivered to ${to}.`}
      </StateBox>
    {:else}
      <StateBox turning>{waiting}</StateBox>
    {/if}

    <Facts {facts} />

    {#if !byHand}
      <Band>as written</Band>
      <Written record={held} held={$heldItem} />
    {/if}

    {#if withdrawable}
      <Band>withdraw</Band>
      <LinkRow
        icon="link-off"
        title="Withdraw this record"
        line="For a note deleted or moved in {to}. Nothing there is touched; the item goes back to the queue."
        danger
        chevron={false}
        disabled={!pool.yes}
        onclick={() => void askToWithdraw()}
      />
    {/if}

    {#if failed !== ""}
      <p role="status" class="m-0 px-gutter py-3 text-danger">{failed}</p>
    {/if}
  {:else if account !== undefined}
    <StateBox
      icon={account.cancelled ? "close" : undefined}
      tone={account.cancelled ? "plain" : "danger"}
    >
      {account.said}
    </StateBox>
    <Facts facts={account.facts} />
  {:else if records.refused !== ""}
    <p role="status" class="m-0 px-gutter py-4 text-danger">
      {records.refused}
    </p>
  {:else if !pool.yes}
    <p class="m-0 px-gutter py-4">{NO_RECORDS_OFFLINE}</p>
  {:else if records.settled && tried !== undefined}
    <div class="px-gutter py-4"><Prose text={NO_SUCH_RECORD} /></div>
  {:else}
    <div class="px-gutter py-4"><Asking /></div>
  {/if}
</div>

<div class="sticky bottom-0 z-20 mt-6">
  <ActionBar at="foot" label="Record">
    <BarAction icon="file" label="Item" href={itemHref(item)} />
    {#if savable && held !== undefined}
      <BarAction
        icon="template"
        label="Save as template"
        href={templateFromHref(item, held.id)}
      />
    {/if}
    {#if held !== undefined}
      {#if offer !== undefined}
        <BarAction
          icon="close"
          label="Cancel"
          onclick={() => void takeBack("cancelled")}
        />
      {:else if byHand}
        <BarAction
          icon="undo"
          label="Undo"
          onclick={() => void takeBack("undone")}
        />
      {/if}
      {#if withdrawn && reinstatable}
        <BarAction
          icon="link"
          label="Reinstate"
          primary
          onclick={() => void reinstate()}
        />
      {:else if delivered && link !== undefined}
        <BarAction icon="link" label="Open in {to}" primary href={link} />
      {:else if delivered && held.pointer !== undefined && copyable()}
        {@const path = held.pointer}
        <BarAction
          icon="copy"
          label="Copy path"
          primary
          onclick={() => void copy(path)}
        />
      {/if}
    {/if}
  </ActionBar>
</div>
