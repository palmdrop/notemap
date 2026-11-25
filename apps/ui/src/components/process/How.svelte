<script lang="ts">
  import Segmented from "$components/primitives/blocks/Segmented.svelte";
  import { impliedOf, labelOf } from "$lib/schema-form";
  import { actionOf, labelFor, wordFor } from "$lib/vocabulary";

  import type { Decision } from "./decision.svelte";
  import StepHead from "./StepHead.svelte";
  import { NOTHING_PICKED, type Steps } from "./steps.svelte";

  /** What the route does there: the output, the action, and the few choices that shape what is written. */
  let { decision, steps }: { decision: Decision; steps: Steps } = $props();
</script>

{#if decision.hasHow || (!steps.onPhone && !decision.templated && decision.chosen === undefined)}
  <section
    id="step-how"
    data-step="how"
    aria-label="how"
    class={steps.shows("how") ? "" : "hidden"}
  >
    <StepHead name="how" phone={steps.onPhone} />
    {#if decision.chosen === undefined}
      <p class="m-0 px-gutter py-3 text-muted">{NOTHING_PICKED}</p>
    {:else}
      {#if decision.offersOutput}
        <div class="border-b border-rule px-gutter py-3">
          <span class="mb-2 block font-display text-weekday lowercase"
            >output</span
          >
          <Segmented
            label="output"
            value={decision.assetsOnly ? "assets" : "everything"}
            options={[
              { value: "everything", word: "Everything" },
              { value: "assets", word: "Attachments only" },
            ]}
            onchoose={(one) => decision.output(one === "assets")}
          />
        </div>
      {/if}
      {#if decision.chooses}
        <div class="border-b border-rule px-gutter py-3">
          <span class="mb-2 block font-display text-weekday lowercase"
            >action</span
          >
          <Segmented
            label="action"
            value={decision.capability}
            options={decision.capabilities.map((one) => ({
              value: one.name,
              word: actionOf(one.name),
            }))}
            onchoose={(one) => {
              decision.capability = one;
              decision.args = {};
            }}
          />
        </div>
      {/if}
      {#each decision.howFields as field (field.name)}
        {@const implied =
          (decision.args[field.name] ?? "") === ""
            ? impliedOf(field, decision.inherited)
            : undefined}
        <div class="border-b border-rule px-gutter py-3">
          <span class="mb-2 block font-display text-weekday lowercase"
            >{labelFor(field)}</span
          >
          <Segmented
            label={labelFor(field)}
            value={(decision.args[field.name] ?? "") === ""
              ? implied
              : decision.args[field.name]}
            options={(field.options ?? []).map((one) => ({
              value: one,
              word: wordFor(field.name, labelOf(field, one)),
            }))}
            onchoose={(one) => decision.give(field.name, one)}
          />
        </div>
      {/each}
    {/if}
  </section>
{/if}
