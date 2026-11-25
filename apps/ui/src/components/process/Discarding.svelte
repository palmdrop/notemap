<script lang="ts">
  import Dialog from "$components/primitives/sheets/Dialog.svelte";

  /** Asked on leaving the composer with a decision begun and not sent. */
  let { onanswer }: { onanswer: (leave: boolean) => void } = $props();
</script>

<Dialog
  title="Leave without routing?"
  ways={[
    { label: "Stay", value: false },
    { label: "Leave", value: true, kind: "danger" },
  ]}
  onanswer={(leave) => onanswer(leave === true)}
>
  <p class="m-0">The route begun here is not sent.</p>
</Dialog>
