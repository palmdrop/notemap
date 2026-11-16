<script lang="ts">
  import type { BatchAction, RoutingTemplate } from "@notemap/client";

  import Box from "$components/primitives/blocks/Box.svelte";
  import Icon from "$components/primitives/icon/Icon.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import Sheet from "$components/primitives/sheets/Sheet.svelte";
  import { askForTemplate, type Step } from "$lib/asked";
  import { takenAs } from "$lib/candidate-list";
  import { notes } from "$lib/batching";
  import { client } from "$lib/client";
  import { nameOf } from "$lib/destinations";
  import { placeOf } from "$lib/templates";

  /**
   * A batch is routed by a template with a trigger tag, or not at all. Its
   * question is asked once for every note; the batch is then confirmed, and
   * counts down on one line with one Cancel.
   */
  let {
    count,
    onbatch,
    onclose,
  }: {
    count: number;
    onbatch: (action: BatchAction) => void;
    onclose: () => void;
  } = $props();

  const templates = client.templates.all;
  const triggered = $derived(
    $templates.filter(
      (template): template is RoutingTemplate & { triggerTag: string } =>
        typeof template.triggerTag === "string",
    ),
  );

  let open = $state<(RoutingTemplate & { triggerTag: string }) | undefined>(
    undefined,
  );
  let steps = $state<readonly Step[] | undefined>(undefined);
  let given = $state<Record<string, string>>({});
  let offered = $state<readonly string[] | undefined>(undefined);
  let typed = $state("");

  const step = $derived(steps?.find((one) => given[one.field] === undefined));

  function send(
    template: RoutingTemplate & { triggerTag: string },
    values: Record<string, string>,
  ) {
    onclose();
    onbatch({
      kind: "tag",
      tag: template.triggerTag,
      ...(Object.keys(values).length === 0 ? {} : { arguments: values }),
    });
  }

  async function choose(template: RoutingTemplate & { triggerTag: string }) {
    if (Object.keys(template.asked ?? {}).length === 0) {
      send(template, {});
      return;
    }
    open = template;
    given = {};
    steps = undefined;
    const asking = await askForTemplate(template);
    if (open !== template) return;
    steps = asking?.steps ?? [];
    if (steps.length === 0) send(template, {});
  }

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

  function answer(value: string) {
    const field = step?.field;
    if (field === undefined || open === undefined) return;
    given = { ...given, [field]: value };
    if (steps?.every((one) => given[one.field] !== undefined) === true) {
      send(open, $state.snapshot(given));
    }
  }
</script>

<Sheet title="route {notes(count)}" wide="dialog" {onclose}>
  {#if open === undefined}
    <p class="px-gutter pt-3 pb-1 text-small text-muted">
      Only templates with a trigger tag route a batch.
    </p>
    <ul class="m-0 list-none p-0">
      {#each triggered as template (template.id)}
        <li>
          <button
            type="button"
            onclick={() => void choose(template)}
            class="grid min-h-bar w-full grid-cols-[var(--spacing-icon)_1fr_auto] items-center gap-3 border-b border-rule px-gutter py-2 text-left"
          >
            <Icon name="route" />
            <span class="min-w-0">
              <span class="block">{template.name}</span>
              <small class="block truncate text-small text-muted"
                >{placeOf(template).replace(/,? ?asks each time$/, "")} in {nameOf(
                  template.destination,
                )}</small
              >
            </span>
            <Icon name="chevron" class="size-5" />
          </button>
        </li>
      {/each}
    </ul>
  {:else if step === undefined || offered === undefined}
    <div class="px-gutter py-3"><Asking /></div>
  {:else}
    <p class="px-gutter pt-3 text-small text-muted">
      {open.name}: {step.label}, once for every note
    </p>
    <ul class="m-0 list-none p-0">
      {#each offered as value (value)}
        <li>
          <button
            type="button"
            onclick={() => answer(value)}
            class="flex min-h-target w-full items-center justify-between border-b border-rule px-gutter text-left"
          >
            <span>{value}</span>
            <Icon name="chevron" class="size-5" />
          </button>
        </li>
      {/each}
    </ul>
    <div class="flex items-center gap-2 px-gutter py-2">
      <input
        bind:value={typed}
        aria-label={step.label}
        placeholder={step.default ?? `Another ${step.label}`}
        class="min-h-9 min-w-0 flex-1 border-b border-rule bg-transparent outline-none"
      />
      <Box disabled={typed.trim() === ""} onclick={() => answer(typed.trim())}
        >Next</Box
      >
    </div>
  {/if}
</Sheet>
