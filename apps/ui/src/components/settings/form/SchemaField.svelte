<script lang="ts">
  import { labelFor } from "$lib/vocabulary";
  import Band from "$components/primitives/blocks/Band.svelte";
  import RadioRows from "$components/primitives/blocks/RadioRows.svelte";
  import Segmented from "$components/primitives/blocks/Segmented.svelte";
  import { labelOf, type Field } from "$lib/schema-form";

  /**
   * One setting from a schema. A choice of a few is a segmented row, a long
   * one rows under a band, anything else typed. Unset, a choice draws the
   * kind's default as picked, and stays unset until another is picked.
   */
  let {
    field,
    value,
    label,
    line,
    placeholder,
    disabled = false,
    onchange,
  }: {
    field: Field;
    value: string;
    label?: string;
    line?: string;
    placeholder?: string;
    disabled?: boolean;
    onchange: (value: string) => void;
  } = $props();

  const named = $derived(label ?? labelFor(field));
  const listed = $derived(field.options ?? field.examples);
  /** A value the daemon no longer declares is carried rather than dropped. */
  const choices = $derived(
    listed === undefined
      ? undefined
      : value !== "" && !listed.includes(value)
        ? [...listed, value]
        : listed,
  );
  const picked = $derived(value === "" ? field.preset : value);
  const wordOf = (one: string): string =>
    listed !== undefined && !listed.includes(one)
      ? `${one} — not declared`
      : labelOf(field, one);
  const few = $derived(
    choices !== undefined &&
      choices.length <= 4 &&
      choices.every((one) => wordOf(one).length <= 16),
  );
</script>

{#if choices !== undefined && !few}
  <Band level={3}>{named}</Band>
  <RadioRows
    label={named}
    value={picked}
    {disabled}
    options={choices.map((one) => ({ value: one, word: wordOf(one) }))}
    onchoose={onchange}
  />
  {#if (line ?? field.description) !== undefined}
    <p class="m-0 border-b border-rule px-gutter py-2 text-small text-muted">
      {line ?? field.description}
    </p>
  {/if}
{:else}
  <div class="border-b border-rule px-gutter py-3">
    <span class="mb-1.5 block text-small">
      {named}{field.required ? "" : " (optional)"}
    </span>
    {#if choices !== undefined}
      <Segmented
        label={named}
        value={picked}
        {disabled}
        options={choices.map((one) => ({ value: one, word: wordOf(one) }))}
        onchoose={onchange}
      />
    {:else}
      <input
        {value}
        {disabled}
        oninput={(event) => onchange(event.currentTarget.value)}
        aria-label={field.name}
        placeholder={placeholder ?? field.placeholder}
        class="min-h-11 w-full rounded-control border border-rule bg-paper px-3 outline-none focus:border-ink disabled:text-muted"
      />
    {/if}
    {#if (line ?? field.description) !== undefined}
      <p class="mt-1.5 mb-0 text-small text-muted">
        {line ?? field.description}
      </p>
    {/if}
  </div>
{/if}
