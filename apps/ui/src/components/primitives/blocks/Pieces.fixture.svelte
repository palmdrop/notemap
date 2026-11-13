<script lang="ts">
  import { untrack } from "svelte";

  import Dialog from "$components/primitives/sheets/Dialog.svelte";
  import Sheet from "$components/primitives/sheets/Sheet.svelte";
  import Dot from "$components/primitives/marks/Dot.svelte";
  import Spinner from "$components/primitives/marks/Spinner.svelte";
  import ActionBar from "./ActionBar.svelte";
  import Band from "./Band.svelte";
  import BarAction from "./BarAction.svelte";
  import Box from "./Box.svelte";
  import RadioRows from "./RadioRows.svelte";
  import Segmented from "./Segmented.svelte";
  import Toggle from "./Toggle.svelte";

  /** Every piece in each of its states, for the tests and for a scratch page's shots. */
  let {
    why,
    at,
    sheet = false,
    sheetForm = "panel",
    dialog = false,
    onpress = () => {},
    onanswer = () => {},
    onclose = () => {},
  }: {
    why?: string;
    at?: "foot" | "head";
    sheet?: boolean;
    sheetForm?: "panel" | "dialog";
    dialog?: boolean;
    onpress?: (what: string) => void;
    onanswer?: (value: string | undefined) => void;
    onclose?: () => void;
  } = $props();

  let order = $state<"oldest" | "newest">("oldest");
  let tags = $state<Record<string, boolean>>({
    home: true,
    work: false,
    idea: false,
  });
  let mode = $state<"create" | "require" | undefined>("create");
  let showing = $state(untrack(() => sheet));
  let asking = $state(untrack(() => dialog));
</script>

<Band>
  order
  {#snippet end()}<span>3</span>{/snippet}
</Band>
<div class="flex flex-col gap-3 p-gutter">
  <Segmented
    label="Order"
    value={order}
    options={[
      { value: "oldest", word: "Oldest first" },
      { value: "newest", word: "Newest first" },
    ]}
    onchoose={(value) => {
      order = value;
      onpress(value);
    }}
  />
  <div class="flex flex-wrap gap-1.5">
    {#each Object.keys(tags) as tag (tag)}
      <Toggle
        on={tags[tag] === true}
        ontoggle={() => {
          tags[tag] = !tags[tag];
          onpress(tag);
        }}>#{tag}</Toggle
      >
    {/each}
  </div>
  <div class="flex flex-wrap gap-2">
    <Box icon="refresh" onclick={() => onpress("check")}>Check again</Box>
    <Box icon="refresh" disabled>Check again</Box>
    <Box danger onclick={() => onpress("revoke")}>Revoke</Box>
    <Box working>Reclaim</Box>
  </div>
  <p class="flex items-center gap-2">
    <Spinner /> Routing by <b>Todo</b>
    <span class="ml-auto inline-flex items-center gap-2"
      ><Dot said="waiting to send" /> 2 waiting</span
    >
  </p>
</div>
<Band level={3}>if the folder is missing</Band>
<RadioRows
  label="If the folder is missing"
  value={mode}
  options={[
    {
      value: "create",
      word: "Make it",
      line: "The folder is made on delivery.",
    },
    {
      value: "require",
      word: "Must exist",
      line: "Refused if it is not there.",
    },
  ]}
  onchoose={(value) => {
    mode = value;
    onpress(value);
  }}
/>

<ActionBar {at}>
  {#snippet say()}{#if why !== undefined}{why}{/if}{/snippet}
  <BarAction
    icon="trash"
    label="Discard"
    danger
    command="discard"
    onclick={() => onpress("discard")}
  />
  <BarAction
    icon="check"
    label="Done"
    command="manual"
    onclick={() => onpress("done")}
  />
  <BarAction
    icon="route"
    label="Route"
    primary
    {why}
    command="process"
    onclick={() => onpress("route")}
  />
</ActionBar>

<div class="flex gap-2 p-gutter">
  <Box onclick={() => (showing = true)}>Open the sheet</Box>
  <Box onclick={() => (asking = true)}>Ask</Box>
</div>

{#if showing}
  <Sheet
    title="filter"
    wide={sheetForm}
    onclose={() => {
      showing = false;
      onclose();
    }}
  >
    <p class="p-gutter">What the sheet holds.</p>
    {#snippet foot()}
      <ActionBar at="foot">
        <BarAction icon="undo" label="Reset" />
        <BarAction icon="check" label="Show 13" primary />
      </ActionBar>
    {/snippet}
  </Sheet>
{/if}

{#if asking}
  <Dialog
    title="lose your changes?"
    ways={[
      { label: "Keep editing", value: "keep" },
      { label: "Lose changes", value: "lose", kind: "danger" },
    ]}
    onanswer={(value) => {
      asking = false;
      onanswer(value);
    }}
  >
    What you wrote since opening it goes.
  </Dialog>
{/if}
