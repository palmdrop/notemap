<script lang="ts">
  import { goto } from "$app/navigation";
  import { saidBy, type RoutingTemplate } from "@notemap/client";

  import { processHref } from "$components/item/href";
  import Box from "$components/primitives/blocks/Box.svelte";
  import Icon, { type IconName } from "$components/primitives/icon/Icon.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import Sheet from "$components/primitives/sheets/Sheet.svelte";
  import { askForTemplate, type Step, type Supplied } from "$lib/asked";
  import { client } from "$lib/client";
  import { takenAs } from "$lib/candidate-list";
  import { aboutItem } from "$lib/excerpt";
  import { routedHere } from "$lib/firing";
  import { slide } from "$lib/motion";
  import { nameOf } from "$lib/destinations";
  import { placeOf } from "$lib/templates";

  /**
   * The quick route: the templates by name and icon, each with where it
   * files. One that asks nothing routes on its Route; one that asks opens in
   * place and asks it, its answers moving on as they are tapped. More options
   * leads to the route page. A sheet on a phone, a dialog when wide.
   */
  let { item: id, onclose }: { item: string; onclose: () => void } = $props();

  const held = $derived(client.held(id));
  const item = $derived($held);
  const templates = client.templates.all;
  const destinations = client.destinations.all;

  const usable = $derived(
    $templates.filter((template) =>
      $destinations.some(
        (one) => one.id === template.destination && one.retired !== true,
      ),
    ),
  );

  let open = $state<string | undefined>(undefined);
  let steps = $state<readonly Step[] | undefined>(undefined);
  let given = $state<Record<string, string>>({});
  let offered = $state<readonly string[] | undefined>(undefined);
  let typed = $state("");
  let busy = $state(false);
  let said = $state("");

  const step = $derived(steps?.find((one) => given[one.field] === undefined));

  function iconOf(template: RoutingTemplate): IconName {
    if (template.capability === "append") return "file";
    const kind = $destinations.find(
      (one) => one.id === template.destination,
    )?.kind;
    return kind === "webdav" ? "cloud" : kind === "arena" ? "grid" : "folder";
  }

  function whereOf(template: RoutingTemplate): string {
    const place = placeOf(template).replace(/,? ?asks each time$/, "");
    return place === "" || place === "—"
      ? nameOf(template.destination)
      : `${place} in ${nameOf(template.destination)}`;
  }

  async function route(template: RoutingTemplate, values: Supplied) {
    busy = true;
    said = "";
    try {
      const record = await client.routing.route(id, {
        template: template.id,
        ...(Object.keys(values).length === 0 ? {} : { arguments: values }),
      });
      routedHere(record);
      onclose();
    } catch (error) {
      said = saidBy(error);
    } finally {
      busy = false;
    }
  }

  async function choose(template: RoutingTemplate) {
    if (open === template.id) {
      open = undefined;
      return;
    }
    const asked = template.asked ?? {};
    if (Object.keys(asked).length === 0) {
      await route(template, {});
      return;
    }
    open = template.id;
    given = {};
    steps = undefined;
    const asking = await askForTemplate(template);
    if (open !== template.id) return;
    steps = asking?.steps ?? [];
    if (steps.length === 0) await route(template, {});
  }

  // The answers the next step offers, asked with what earlier ones gave.
  $effect(() => {
    const now = step;
    offered = undefined;
    typed = "";
    if (now === undefined) return;
    if (now.closed !== undefined) {
      offered = now.closed;
      return;
    }
    if (now.listed === undefined) {
      offered = [];
      return;
    }
    void now
      .listed($state.snapshot(given))
      .then((entries) => {
        if (step === now) offered = entries.map((entry) => takenAs(entry));
      })
      .catch(() => (offered = []));
  });

  async function answer(template: RoutingTemplate, value: string) {
    const field = step?.field;
    if (field === undefined) return;
    given = { ...given, [field]: value };
    if (steps?.every((one) => given[one.field] !== undefined) === true) {
      await route(template, $state.snapshot(given));
    }
  }
</script>

<Sheet title="route" wide="dialog" {onclose}>
  {#if item !== undefined}
    <p class="truncate px-gutter pt-3 pb-1 text-muted">{aboutItem(item)}</p>
  {/if}
  {#if said !== ""}
    <p role="status" class="px-gutter py-2 text-danger">{said}</p>
  {/if}
  <ul class="m-0 list-none p-0">
    {#each usable as template (template.id)}
      {@const asks = Object.keys(template.asked ?? {}).length > 0}
      {@const expanded = open === template.id}
      <li class="border-b border-rule">
        <button
          type="button"
          disabled={busy}
          aria-expanded={asks ? expanded : undefined}
          onclick={() => void choose(template)}
          class="grid min-h-bar w-full grid-cols-[var(--spacing-icon)_1fr_auto] items-center gap-3 px-gutter py-2 text-left"
        >
          <Icon name={iconOf(template)} />
          <span class="min-w-0">
            <span class="block">{template.name}</span>
            <small class="block truncate text-small text-muted"
              >{whereOf(template)}</small
            >
          </span>
          {#if asks}
            <Icon name={expanded ? "up" : "chevron"} class="size-5" />
          {:else}
            <span class="underline underline-offset-[0.2em]">Route</span>
          {/if}
        </button>
        {#if expanded}
          <div transition:slide class="border-t border-rule bg-paper">
            {#if step === undefined || offered === undefined}
              <div class="px-gutter py-3"><Asking /></div>
            {:else}
              <p class="px-gutter pt-2 text-small text-muted">{step.label}</p>
              <ul class="m-0 list-none p-0">
                {#each offered as value (value)}
                  {@const last =
                    steps?.filter((one) => given[one.field] === undefined)
                      .length === 1}
                  <li>
                    <button
                      type="button"
                      disabled={busy}
                      onclick={() => void answer(template, value)}
                      class="flex min-h-target w-full items-center justify-between border-b border-rule pr-gutter pl-[calc(var(--spacing-gutter)+var(--spacing-icon)+0.75rem)] text-left last:border-b-0"
                    >
                      <span>{value}</span>
                      {#if last}
                        <span class="underline underline-offset-[0.2em]"
                          >Route</span
                        >
                      {:else}
                        <Icon name="chevron" class="size-5" />
                      {/if}
                    </button>
                  </li>
                {/each}
              </ul>
              <form
                class="flex items-center gap-2 px-gutter py-2"
                onsubmit={(event) => {
                  event.preventDefault();
                  if (typed.trim() !== "") void answer(template, typed.trim());
                }}
              >
                <input
                  bind:value={typed}
                  aria-label={step.label}
                  placeholder={step.default ?? `Another ${step.label}`}
                  class="min-h-9 min-w-0 flex-1 border-b border-rule bg-transparent outline-none"
                />
                <Box
                  disabled={typed.trim() === "" || busy}
                  onclick={() => void answer(template, typed.trim())}>Next</Box
                >
              </form>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  <div class="px-gutter py-4">
    <Box
      icon="next"
      onclick={() => {
        onclose();
        void goto(processHref(id));
      }}>More options</Box
    >
  </div>
</Sheet>
