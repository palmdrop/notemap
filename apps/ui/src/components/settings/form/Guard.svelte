<script lang="ts">
  import { onMount } from "svelte";

  import Dialog from "$components/primitives/sheets/Dialog.svelte";
  import { answer, opened, question, type Open } from "$lib/leaving.svelte";

  /**
   * A settings form with changes asks before it is left, by its own Cancel or
   * by the system's back: Keep editing, or Lose changes.
   */
  let {
    about,
    changed,
  }: {
    about: string;
    changed: () => boolean;
  } = $props();

  const self: Open = {
    get about() {
      return about;
    },
    changed: () => changed(),
    save: () => Promise.resolve(false),
    revert: () => undefined,
    resume: () => undefined,
  };

  onMount(() => opened(self));
</script>

{#if question.about === self}
  <Dialog
    title="lose your changes?"
    ways={[
      { label: "Keep editing", value: "stay" as const },
      {
        label: "Lose changes",
        value: "revert" as const,
        kind: "danger" as const,
      },
    ]}
    onanswer={(choice) => void answer(choice ?? "stay")}
  >
    <span class="wrap-anywhere">Unsaved changes to {about}.</span>
  </Dialog>
{/if}
