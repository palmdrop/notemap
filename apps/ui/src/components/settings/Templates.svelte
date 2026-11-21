<script lang="ts">
  import { untrack } from "svelte";
  import { goto, replaceState } from "$app/navigation";
  import { page } from "$app/state";

  import {
    saidBy,
    type RoutingTemplate,
    type RoutingTemplateReport,
  } from "@notemap/client";

  import Trigger from "$components/primitives/marks/Trigger.svelte";
  import LinkRow from "$components/primitives/rows/LinkRow.svelte";
  import Dialog from "$components/primitives/sheets/Dialog.svelte";
  import TemplatePage from "$components/settings/Template.svelte";
  import TemplateForm from "$components/settings/TemplateForm.svelte";
  import Section from "$components/settings/Section.svelte";
  import { client } from "$lib/client";
  import {
    capabilityHeld,
    described,
    readingHeld,
  } from "$lib/described.svelte";
  import { templateIcon } from "$lib/looks";
  import { nameFor } from "$lib/names.svelte";
  import { resolve } from "$lib/naming";
  import { placeOf } from "$lib/templates";
  import { reportSaid } from "$lib/template-state";
  import { reachable } from "$lib/reachable.svelte";

  import { newHref, openHref, settingsHref } from "./href";
  import { draftOf, type RoutingTemplateDraft } from "$lib/template-draft";

  const templates = client.templates.all;
  const destinations = client.destinations.all;
  const pool = reachable();

  /** The list, one template on its own page, or a form: read off the address. */
  const opened = $derived(page.url.searchParams.get("open") ?? undefined);
  const editing = $derived(page.url.searchParams.has("edit"));
  const adding = $derived(page.url.searchParams.has("new"));
  const one = $derived($templates.find((each) => each.id === opened));

  // A channel id says nothing a person can read: what each template names is
  // asked for once, and drawn by name once it is known.
  $effect(() => {
    for (const one of $templates) {
      void described(one.destination);
      void resolve(
        one.destination,
        Object.keys(one.arguments).map((field) => ({
          capability: one.capability,
          field,
          value: String(one.arguments[field] ?? ""),
        })),
      );
    }
  });

  /** Where a template files, by name: "todo.md in Vault". */
  function whereOf(one: RoutingTemplate): string {
    const reading = readingHeld(one.destination, one.capability);
    void capabilityHeld(one.destination, one.capability);
    const place =
      reading === "asking"
        ? ""
        : placeOf(
            one,
            (field, value) =>
              nameFor({
                destination: one.destination,
                capability: one.capability,
                field,
                value,
              }),
            reading,
          );
    const name =
      $destinations.find((each) => each.id === one.destination)?.name ??
      "a destination";
    return place === "" || place === "—" ? name : `${place} in ${name}`;
  }

  /** A form done with gives way to what it was opened from, in its place in history. */
  function back(): void {
    void goto(
      opened === undefined || adding
        ? settingsHref("templates")
        : openHref("templates", opened),
      { replaceState: true },
    );
  }
  let doomed = $state<RoutingTemplate | undefined>(undefined);
  let said = $state("");

  /** A routing record this was opened from, to be saved as a template. */
  const from = $derived({
    item: page.url.searchParams.get("item"),
    record: page.url.searchParams.get("record"),
  });
  let starting = $state<RoutingTemplateDraft | undefined>(undefined);
  let unfound = $state(false);

  // Read once the pool answers: the records are the pool's, and the draft says
  // nothing until the destinations it names are held.
  $effect(() => {
    const { item, record } = from;
    if (item === null || record === null || !pool.yes) return;
    let live = true;

    void (async () => {
      try {
        const [read, records] = await Promise.all([
          client.item(item),
          client.routing.recordsFor(item),
          client.destinations.load(),
        ]);
        if (!live) return;
        const found = records.find((one) => one.id === record);
        starting =
          found === undefined || read.item === undefined
            ? undefined
            : draftOf(found, read.item, client.destinations.held);
        unfound = starting === undefined;
      } catch (error) {
        if (live) said = saidBy(error);
      }
    })();

    return () => {
      live = false;
    };
  });

  /** Saved or let go, the address stops saying what to start from. */
  function started(): void {
    starting = undefined;
    const url = new URL(page.url);
    url.searchParams.delete("item");
    url.searchParams.delete("record");
    replaceState(url, {});
  }

  /** Per template rather than for the list: the question is I/O that may hang. */
  let reports = $state<Record<string, RoutingTemplateReport>>({});
  let asking = $state<Record<string, boolean>>({});

  async function read() {
    try {
      await Promise.all([client.templates.load(), client.destinations.load()]);
    } catch (error) {
      said = saidBy(error);
    }
  }

  $effect(() => {
    if (pool.yes) void read();
  });

  async function asks(one: RoutingTemplate): Promise<void> {
    asking = { ...asking, [one.id]: true };
    try {
      // Read after the answer, never spread around the await: two rows asking
      // at once both spread the same record and the slower one wins.
      const answer = await client.templates.report(one.id);
      reports = { ...reports, [one.id]: answer };
    } finally {
      asking = { ...asking, [one.id]: false };
    }
  }

  /** Anything else is worth asking again when the pool comes back into reach. */
  const SETTLED: readonly RoutingTemplateReport["kind"][] = [
    "fits",
    "stranded",
    "destination-retired",
    "capability-undeclared",
    "arguments-invalid",
    "folder-missing",
    "destination-unusable",
  ];

  // Asked per row as the page draws, so the first template whose destination
  // has to go and look does not hold up a list already drawn from pool state.
  $effect(() => {
    const yes = pool.yes;
    const held = $templates;
    if (!yes) return;

    untrack(() => {
      for (const one of held) {
        const answer = reports[one.id];
        const settled = answer !== undefined && SETTLED.includes(answer.kind);
        if (asking[one.id] !== true && !settled) {
          void asks(one).catch(() => undefined);
        }
      }
    });
  });

  async function attempt(what: () => Promise<unknown>) {
    said = "";
    try {
      await what();
    } catch (error) {
      said = saidBy(error);
    }
  }
</script>

{#if starting !== undefined}
  <TemplateForm
    destinations={$destinations}
    {starting}
    disabled={!pool.yes}
    done={started}
  />
{:else if adding}
  <TemplateForm destinations={$destinations} disabled={!pool.yes} done={back} />
{:else if one !== undefined && editing}
  <TemplateForm
    destinations={$destinations}
    editing={one}
    disabled={!pool.yes}
    done={back}
  />
{:else if one !== undefined}
  <TemplatePage
    {one}
    destination={$destinations.find((each) => each.id === one.destination)}
    report={reports[one.id]}
    asking={asking[one.id] === true}
    offline={!pool.yes}
    oncheck={() => void asks(one)}
    ondelete={() => (doomed = one)}
  />
{:else}
  <Section name="templates">
    <div class="flex flex-col">
      <div>
        {#if !pool.yes}
          <!-- The chrome already says the pool is out of reach; this names
               what that costs here, and is not painted as an alarm. -->
          <p role="status" class="m-0 px-gutter py-3 text-small text-muted">
            The pool is out of reach. Templates can be read but not changed.
          </p>
        {/if}

        {#if said !== ""}
          <p role="status" class="m-0 px-gutter py-3 text-danger">{said}</p>
        {/if}

        {#if unfound}
          <p role="status" class="m-0 px-gutter py-3">
            That routing record cannot be saved as a template.
          </p>
        {/if}

        {#each $templates as each (each.id)}
          {@const destination = $destinations.find(
            (held) => held.id === each.destination,
          )}
          {@const report = reportSaid(
            reports[each.id],
            asking[each.id] === true,
          )}
          <LinkRow
            icon={templateIcon(each, destination?.kind)}
            title={each.name}
            label={each.name}
            line={destination === undefined
              ? "stranded: its destination was deleted. Does nothing until repointed."
              : report.alarm || report.text === "not reachable"
                ? report.text
                : whereOf(each)}
            lineDanger={destination === undefined || report.alarm}
            href={openHref("templates", each.id)}
          >
            {#snippet aside()}
              {#if each.triggerTag !== undefined}<Trigger
                  tag={each.triggerTag}
                />{/if}
            {/snippet}
          </LinkRow>
        {/each}
      </div>

      <LinkRow
        icon="plus"
        title="Add a template"
        label="Add a template"
        chevron={false}
        why={!pool.yes
          ? "The pool is out of reach."
          : $destinations.length === 0
            ? "Add a destination first."
            : undefined}
        href={newHref("templates")}
      />
    </div>
  </Section>
{/if}

{#if doomed !== undefined}
  {@const going = doomed}
  <Dialog
    title="Delete {going.name}?"
    ways={[
      { label: "Keep", value: false },
      { label: "Delete", value: true, kind: "danger" },
    ]}
    onanswer={(yes) => {
      const id = going.id;
      doomed = undefined;
      if (yes === true)
        void attempt(async () => {
          await client.templates.delete(id);
          await goto(settingsHref("templates"), { replaceState: true });
        });
    }}
  >
    <p class="m-0">
      Records made from it keep resolving; its tag stops filing anything.
    </p>
  </Dialog>
{/if}
