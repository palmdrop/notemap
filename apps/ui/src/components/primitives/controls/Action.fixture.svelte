<script lang="ts">
  import Action from "./Action.svelte";

  let {
    label,
    primary = false,
    disabled = false,
    href,
    onclick,
  }: {
    label: string;
    primary?: boolean;
    disabled?: boolean;
    href?: string;
    onclick: () => void;
  } = $props();
</script>

<Action {primary} {disabled} {href} {onclick}>{label}</Action>
