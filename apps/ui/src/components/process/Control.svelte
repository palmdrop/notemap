<script lang="ts">
  import Band from "$components/primitives/blocks/Band.svelte";
  import RadioRows from "$components/primitives/blocks/RadioRows.svelte";
  import { browserFor } from "$lib/candidate-browsers";
  import { givenFor, impliedOf, labelOf, type Field } from "$lib/schema-form";
  import { labelFor, lineFor, wordFor } from "$lib/vocabulary";

  import { LINE_FIELD, type Decision } from "./decision.svelte";

  /**
   * One argument of the place: a browser over what the destination lists, rows
   * for a long choice, or a field to type it in.
   */
  let {
    decision,
    field,
    onrelease,
  }: { decision: Decision; field: Field; onrelease: () => void } = $props();

  const title = $derived(labelFor(field));
</script>

{#if field.listable && decision.chosen !== undefined && decision.capability !== undefined}
  {@const Browser = browserFor(field)}
  <div class="border-b border-rule px-gutter py-3">
    <Browser
      destination={decision.chosen}
      capability={decision.capability}
      field={field.name}
      label={title}
      placeholder={field.placeholder ??
        `${field.name === "heading" ? "Under a heading" : `Pick the ${title}`}${field.required ? "" : " (optional)"}`}
      value={decision.args[field.name] ?? ""}
      said={field.name === LINE_FIELD ? decision.spoken : undefined}
      given={givenFor(field, decision.args)}
      offeredOnly={field.offeredOnly}
      onchange={(value) => decision.give(field.name, value)}
      {onrelease}
    />
  </div>
{:else if field.options !== undefined}
  <!-- A long choice is rows; one left unset is drawn as what it comes out as. -->
  {@const implied =
    (decision.args[field.name] ?? "") === ""
      ? impliedOf(field, decision.inherited)
      : undefined}
  <Band level={3}>{title}</Band>
  <RadioRows
    label={title}
    value={(decision.args[field.name] ?? "") === ""
      ? implied
      : decision.args[field.name]}
    options={field.options.map((one) => ({
      value: one,
      word: wordFor(field.name, labelOf(field, one)),
      ...(lineFor(field.name, one) === undefined
        ? {}
        : { line: lineFor(field.name, one) }),
    }))}
    onchoose={(one) => decision.give(field.name, one)}
  />
{:else}
  <label class="block border-b border-rule px-gutter py-3">
    <span class="mb-1.5 block text-small">{title}</span>
    <input
      bind:value={decision.args[field.name]}
      placeholder={field.required ? "required" : "optional"}
      aria-label={title}
      class="min-h-11 w-full rounded-control border border-edge bg-paper px-3 outline-none focus:border-ink"
    />
  </label>
{/if}
