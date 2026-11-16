<script lang="ts">
  import PageBar from "$components/primitives/frame/PageBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";

  /**
   * A form's bar: Cancel, and Save, which is always "Save" and, while it
   * cannot be pressed, says what is missing on the line over it.
   */
  let {
    missing,
    busy = false,
    label = "Save",
    oncancel,
    onsave,
  }: {
    missing?: string;
    busy?: boolean;
    label?: string;
    oncancel: () => void;
    onsave: () => void;
  } = $props();
</script>

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
