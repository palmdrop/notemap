<script lang="ts">
  import Dialog from "$components/primitives/sheets/Dialog.svelte";

  /** Asked before a batch is sent: what it will do, to how many, and what it will not do as asked. */
  let {
    question,
    notes,
    verb,
    alarm = false,
    onanswer,
  }: {
    question: string;
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
  {#each notes as note (note)}
    <p class="m-0">{note}</p>
  {/each}
</Dialog>
