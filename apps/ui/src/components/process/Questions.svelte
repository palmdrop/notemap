<script lang="ts">
  import Band from "$components/primitives/blocks/Band.svelte";
  import RadioRows from "$components/primitives/blocks/RadioRows.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import LinkRow from "$components/primitives/rows/LinkRow.svelte";
  import { labelFor } from "$lib/vocabulary";

  import type { Decision } from "./decision.svelte";
  import type { Steps } from "./steps.svelte";

  /** What a taken template asks each time, a step for each question. */
  let { decision, steps }: { decision: Decision; steps: Steps } = $props();
</script>

{#each decision.askedFields as field (field.name)}
  {@const question = steps.questions.find((one) => one.field === field.name)}
  {@const offered = steps.answers[field.name]}
  {@const title = decision.asking[field.name]?.label ?? labelFor(field)}
  <section
    id="step-ask:{field.name}"
    data-step="ask"
    class={steps.shows(`ask:${field.name}`) ? "" : "hidden"}
  >
    <Band>{title}</Band>
    {#if question === undefined || offered === undefined}
      <div class="px-gutter py-3"><Asking /></div>
    {:else}
      {#if steps.onPhone}
        {#each offered as value (value)}
          <LinkRow
            title={value}
            label={value}
            strong={decision.args[field.name] === value}
            onclick={() => steps.answer(field.name, value)}
          />
        {/each}
      {:else if offered.length > 0}
        <RadioRows
          label={title}
          value={decision.args[field.name]}
          options={offered.map((value) => ({ value, word: value }))}
          onchoose={(value) => steps.answer(field.name, value)}
        />
      {/if}
      {#if question.closed === undefined}
        <form
          class="flex items-center gap-2 border-b border-rule px-gutter py-3"
          onsubmit={(event) => {
            event.preventDefault();
            const said = (steps.typedAnswer[field.name] ?? "").trim();
            if (said !== "") steps.answer(field.name, said);
          }}
        >
          <input
            value={steps.typedAnswer[field.name] ?? ""}
            oninput={(event) => {
              const typedNow = event.currentTarget.value;
              steps.typedAnswer = {
                ...steps.typedAnswer,
                [field.name]: typedNow,
              };
              decision.give(field.name, typedNow.trim());
            }}
            {@attach (input) => {
              if (
                !steps.onPhone &&
                field.name === decision.askedFields[0]?.name
              )
                input.focus();
            }}
            aria-label={title}
            placeholder={offered.length === 0 ? title : `Another ${title}`}
            class="min-h-11 min-w-0 flex-1 rounded-control border border-edge bg-paper px-3 outline-none focus:border-ink"
          />
        </form>
      {/if}
    {/if}
  </section>
{/each}
