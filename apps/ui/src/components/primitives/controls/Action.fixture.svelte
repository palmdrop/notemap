<script lang="ts">
  import Action from "./Action.svelte";

  let {
    label,
    primary = false,
    disabled = false,
    onclick,
  }: {
    label: string;
    primary?: boolean;
    disabled?: boolean;
    onclick: () => void;
  } = $props();
</script>

<Action {primary} {disabled} {onclick}>{label}</Action>
