<script lang="ts">
  import PageBar from "$components/primitives/frame/PageBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import { width } from "$lib/breakpoint";

  /**
   * A form's bar: Cancel, and Save, which is always "Save" and, while it
   * cannot be pressed, says what is missing on the line by it. At the head of
   * the form when wide, so Save is never below the fold; docked at the foot
   * on a phone.
   */
  let {
    missing,
    busy = false,
    label = "Save",
    oncancel,
    onsave,
    at,
  }: {
    /** Where this one is drawn: a form puts one at its head for a wide window and one at its foot for a phone. */
    at: "head" | "foot";
    missing?: string;
    busy?: boolean;
    label?: string;
    oncancel: () => void;
    onsave: () => void;
  } = $props();
</script>

{#if (at === "head") === width.wide}
  <PageBar label="Form">
    {#snippet say()}{missing ?? ""}{/snippet}
    <BarAction icon="close" label="Cancel" onclick={oncancel} />
    <BarAction
      icon="check"
      {label}
      primary
      working={busy}
      why={missing}
      onclick={onsave}
    />
  </PageBar>
{/if}
