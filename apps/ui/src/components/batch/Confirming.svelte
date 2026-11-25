<script lang="ts">
  import Dialog from "$components/primitives/sheets/Dialog.svelte";

  /** Asked before a batch is sent: what it will do, to how many, and what it will not do as asked. */
  let {
    question,
    by,
    notes,
    verb,
    alarm = false,
    onanswer,
  }: {
    question: string;
    /** The template a route goes by, and where its values put the items. */
    by?: { readonly name: string; readonly where?: string };
    notes: readonly string[];
    /** The word on the button that sends it: `Route`, `Discard`. */
    verb: string;
    alarm?: boolean;
    onanswer: (go: boolean) => void;
  } = $props();
</script>

<Dialog
  title={question}
  ways={[
    { label: "Back", value: false },
    { label: verb, value: true, kind: alarm ? "danger" : "primary" },
  ]}
  onanswer={(go) => onanswer(go === true)}
>
  {#if by !== undefined}
    <p class="m-0">
      With <strong class="font-semibold">{by.name}</strong>{by.where ===
      undefined
        ? ""
        : `, ${by.where}`}.
    </p>
  {/if}
  {#each notes as note (note)}
    <p class="m-0">{note}</p>
  {/each}
</Dialog>
