<script lang="ts">
  import Band from "$components/primitives/blocks/Band.svelte";
  import RadioRows from "$components/primitives/blocks/RadioRows.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import PathLine from "$components/routing/PathLine.svelte";
  import { nameOf } from "$lib/destinations";
  import { impliedOf } from "$lib/schema-form";
  import { labelFor, lineFor, wordFor } from "$lib/vocabulary";

  import Control from "./Control.svelte";
  import type { Decision } from "./decision.svelte";
  import StepHead from "./StepHead.svelte";
  import { NOTHING_PICKED, type Steps } from "./steps.svelte";

  /** Where in the destination: the typed line where it draws one, and the fields beside it. */
  let {
    decision,
    steps,
    onrelease,
  }: { decision: Decision; steps: Steps; onrelease: () => void } = $props();
</script>

<section
  id="step-place"
  data-step="place"
  aria-label="place"
  class={steps.shows("place") ? "" : "hidden"}
>
  <StepHead name="place" phone={steps.onPhone} />
  {#if decision.chosen === undefined}
    <p class="m-0 px-gutter py-3 text-muted">{NOTHING_PICKED}</p>
  {:else if decision.described === undefined}
    <div class="px-gutter py-3">
      <Asking subject={nameOf(decision.chosen)} />
    </div>
  {:else if decision.lined && decision.line !== undefined && decision.capability !== undefined}
    {@const line = decision.line}
    <div class="border-b border-rule px-gutter py-3">
      <PathLine
        destination={decision.chosen}
        capability={decision.capability}
        field={line.name}
        label={labelFor(line)}
        placeholder={`Find a folder in ${nameOf(decision.chosen)}`}
        value={decision.args[line.name] ?? ""}
        said={decision.spoken}
        places={decision.places}
        onchange={(value) => decision.give(line.name, value)}
        {onrelease}
        onforecast={(word) => (decision.forecast = word)}
      />
    </div>
    {#each decision.placeFields as field (field.name)}
      <Control {decision} {field} {onrelease} />
    {/each}
    {#if decision.folderMode !== undefined}
      {@const mode = decision.folderMode}
      {@const implied =
        (decision.args[mode.name] ?? "") === ""
          ? impliedOf(mode, decision.inherited)
          : undefined}
      <Band level={3}>if the folder is missing</Band>
      <RadioRows
        label="if the folder is missing"
        value={(decision.args[mode.name] ?? "") === ""
          ? implied
          : decision.args[mode.name]}
        options={(mode.options ?? []).map((one) => ({
          value: one,
          word: wordFor(mode.name, one),
          ...(lineFor(mode.name, one) === undefined
            ? {}
            : { line: lineFor(mode.name, one) }),
        }))}
        onchoose={(one) => decision.give(mode.name, one)}
      />
    {/if}
  {:else}
    {#each decision.placeFields as field (field.name)}
      <Control {decision} {field} {onrelease} />
    {/each}
  {/if}
</section>
