<script lang="ts">
  import { onMount } from "svelte";

  import type { Item } from "@notemap/client";

  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import AttachedLines from "$components/item/AttachedLines.svelte";
  import AttachedPictures from "$components/item/AttachedPictures.svelte";
  import Routing from "$components/item/Routing.svelte";
  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import Unfurls from "$components/unfurl/Unfurls.svelte";
  import { client } from "$lib/client";
  import { publish } from "$lib/command/stack.svelte";
  import { aboutItem } from "$lib/excerpt";
  import { headed } from "$lib/heading.svelte";
  import { rise } from "$lib/motion";
  import { orderFor } from "$lib/order";
  import { DISCARD, MANUAL } from "$lib/processing";
  import { reachable } from "$lib/reachable.svelte";
  import { trail } from "$lib/trail.svelte";
  import { saidBy } from "@notemap/client";

  import Check from "./Check.svelte";
  import { Choosing } from "./choosing.svelte";
  import { Decision } from "./decision.svelte";
  import Discarding from "./Discarding.svelte";
  import How from "./How.svelte";
  import Place from "./Place.svelte";
  import { Previewing } from "./previewing.svelte";
  import Questions from "./Questions.svelte";
  import Routed from "./Routed.svelte";
  import { Sending } from "./sending.svelte";
  import { Steps } from "./steps.svelte";
  import Where from "./Where.svelte";

  /**
   * The route page: the item beside the steps that decide where it goes,
   * every step at once when wide and one at a time on a phone, then the route
   * just made in the check's place.
   */
  let { item }: { item: Item } = $props();

  const queue = client.queue;
  const pool = reachable();
  const offline = $derived(!pool.yes);

  /**
   * What the item carries, read from the client's held copy rather than the
   * item this opened on: a tag taken here lands on the held copy first, and
   * the row draws it taken the moment it does.
   */
  const held = $derived(client.held(item.id));
  const tags = $derived((($held ?? item).tags ?? []).map((tag) => tag.name));
  const summary = $derived(($held ?? item).routing);

  const decision = new Decision(() => item);
  const steps = new Steps(decision);
  const previewing = new Previewing(decision);
  const sending = new Sending(decision, steps, {
    tags: () => tags,
    summary: () => summary,
    offline: () => offline,
    release,
  });
  const choosing = new Choosing(decision, {
    offline: () => offline,
    release,
    advance: () => sending.advance(),
  });

  /** A wrong choice is not a reason to leave the surface. */
  function release(): void {
    sending.routed = undefined;
    decision.release();
    previewing.clear();
    steps.at = 0;
  }

  function edit(): void {
    if (decision.edit() && steps.onPhone) void steps.goTo("check");
  }

  // Which destinations exist is not stable for the life of a connection, so
  // arriving reads them again rather than trusting what is held. The queue is
  // what `next` walks, and a deep link arrives without one.
  onMount(() => {
    void client.destinations.load().catch((error: unknown) => {
      decision.said = saidBy(error);
    });

    // Separately, and quietly: a pool that cannot answer for templates is a
    // band that stays empty, not a surface that cannot route to a destination.
    void client.templates.load().catch(() => undefined);

    if (!$queue.items.some((one) => one.id === item.id)) {
      void client
        .enter("queue", orderFor("queue", page.url))
        .catch(() => undefined);
    }
  });

  headed(() => ({
    title: sending.routed === undefined ? "route" : "routed",
    out: { icon: "close", label: "Close", run: leave },
    ...(steps.onPhone && sending.routed === undefined
      ? {
          aside: `${steps.word}  ${String(steps.at + 1)} of ${String(steps.names.length)}`,
        }
      : {}),
    ...(steps.onPhone ? { under: aboutItem(item) } : {}),
  }));

  let confirming = $state(false);

  /**
   * Back to where the route began. Opened at its address, there is nowhere
   * before it, and the queue takes its place.
   */
  function back(): void {
    trail.leave(resolve("/"));
  }

  function leave(): void {
    if (decision.entered) confirming = true;
    else back();
  }

  // Routing is the one command that fires with the caret in a field: the
  // decision is finished there, and reaching for the mouse to send it is the
  // gesture this surface exists to spare.
  publish(() => [
    {
      id: "route",
      label: "route",
      whileWriting: true,
      refusal: decision.ready
        ? undefined
        : decision.askedSettled
          ? "nowhere to send it"
          : "the template asks for something",
      run: () => void sending.send(),
    },
    {
      id: "edit",
      label: "edit",
      refusal: decision.assetsOnly ? "only the attachments go" : undefined,
      run: edit,
    },
    {
      id: "back",
      label: "back",
      run: () => (decision.editing ? decision.done() : leave()),
    },
    {
      id: "previous",
      label: "previous item",
      refusal:
        sending.around.previous === undefined
          ? "first in the queue"
          : undefined,
      run: () => sending.walk(sending.around.previous),
    },
    {
      id: "next",
      label: "next item",
      refusal:
        sending.around.next === undefined ? "last in the queue" : undefined,
      run: () => sending.walk(sending.around.next),
    },
  ]);

  /** A typed answer to the question on screen, which Next takes as a tap would. */
  const typedHere = $derived(
    steps.step?.startsWith("ask:") === true
      ? (steps.typedAnswer[steps.step.slice(4)] ?? "").trim()
      : "",
  );
</script>

{#if confirming}
  <Discarding
    onanswer={(leaving) => {
      confirming = false;
      if (leaving) back();
    }}
  />
{/if}

<div
  in:rise
  class="flex min-h-0 w-full flex-1 flex-col wide:grid wide:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
>
  {#if !steps.onPhone}
    <!-- The item, whole, beside every step. -->
    <section
      aria-label="item"
      class="flex min-h-0 flex-col overflow-auto border-r border-rule"
    >
      <div class="px-gutter py-5">
        <div class="mb-2 text-small text-muted">
          <Stamp at={item.createdAt} inline />
        </div>

        {#if summary !== undefined}
          <div class="mb-2 flex min-w-0 items-baseline gap-x-4">
            <div class="min-w-0">
              <Routing {summary} records={sending.records.all} short />
            </div>
            {#if sending.takeable !== undefined}
              {@const { record, offer } = sending.takeable}
              <button
                type="button"
                class="shrink-0 underline underline-offset-[0.2em]"
                onclick={() => void sending.takeBack(record)}>{offer}</button
              >
            {/if}
          </div>
        {/if}

        <AttachedPictures
          attachments={decision.attachments}
          picture="max-h-64"
        />
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="max-w-prose break-words whitespace-pre-wrap"
          ondblclick={edit}
        >
          {decision.shownWords}
        </div>
        <AttachedLines
          attachments={decision.attachments}
          ruled={decision.shownWords !== ""}
        />
        <Unfurls text={decision.shownWords} />
      </div>
      <!-- Discard and Manual at the foot of the item, level with Route at
           the foot of the steps. -->
      <div class="mt-auto">
        {#if sending.routed === undefined}
          <ActionBar label="Item">
            <BarAction
              icon="trash"
              label="Discard"
              danger
              why={choosing.unusable[DISCARD]}
              onclick={() => void choosing.choose(DISCARD)}
            />
            <BarAction
              icon="check"
              label="Manual"
              why={choosing.unusable[MANUAL]}
              onclick={() => void choosing.choose(MANUAL)}
            />
          </ActionBar>
        {/if}
      </div>
    </section>
  {/if}

  <section aria-label="steps" class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 flex-1 overflow-auto">
      {#if sending.routed !== undefined}
        <Routed
          routed={sending.routed}
          {sending}
          item={item.id}
          onagain={() => {
            sending.routed = undefined;
            steps.at = 0;
          }}
        />
      {:else}
        {#key steps.onPhone ? steps.step : "all"}
          <div in:rise>
            <Where {decision} {steps} {choosing} onrelease={release} />
            {#if decision.templated}
              <Questions {decision} {steps} />
            {:else}
              <How {decision} {steps} />
              <Place {decision} {steps} onrelease={release} />
            {/if}
            <Check
              {decision}
              {steps}
              {previewing}
              {tags}
              templates={summary?.templates ?? []}
              ontemplate={(template) => void choosing.take(template)}
              onedit={edit}
            />
          </div>
        {/key}
      {/if}
    </div>

    <div class="flex-none">
      {#if sending.routed !== undefined}
        <ActionBar label="Routed">
          {#if sending.takeable !== undefined}
            {@const { record } = sending.takeable}
            <BarAction
              icon="close"
              label="Cancel"
              onclick={() => void sending.takeBack(record)}
            />
          {/if}
          <BarAction
            icon="next"
            label="Next item"
            primary
            command="next"
            onclick={() => void sending.advance()}
          />
        </ActionBar>
      {:else if steps.onPhone}
        <ActionBar label="Route">
          {#snippet say()}{#if steps.step === "check" && !decision.ready && !decision.busy}{steps.whyNot}{/if}{/snippet}
          <BarAction
            icon="back"
            label="Back"
            disabled={steps.at === 0}
            onclick={() => steps.backward()}
          />
          {#if steps.step === "check"}
            <BarAction
              icon="route"
              label="Route"
              primary
              working={decision.busy}
              why={!decision.ready && !decision.busy ? steps.whyNot : undefined}
              command="route"
              onclick={() => void sending.send()}
            />
          {:else if steps.step === "how" || steps.step === "place" || typedHere !== ""}
            <BarAction
              icon="next"
              label="Next"
              primary
              disabled={decision.chosen === undefined}
              onclick={() => {
                const step = steps.step;
                if (step?.startsWith("ask:") === true) {
                  steps.answer(step.slice(4), typedHere);
                  return;
                }
                steps.forward();
              }}
            />
          {/if}
        </ActionBar>
      {:else}
        <ActionBar label="Route">
          {#snippet say()}{#if !decision.ready && !decision.busy}{steps.whyNot}{/if}{/snippet}
          <BarAction
            icon="route"
            label="Route"
            primary
            working={decision.busy}
            why={!decision.ready && !decision.busy ? steps.whyNot : undefined}
            command="route"
            onclick={() => void sending.send()}
          />
        </ActionBar>
      {/if}
    </div>
  </section>
</div>
