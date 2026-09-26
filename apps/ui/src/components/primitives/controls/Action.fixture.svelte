<script lang="ts">
  import Action from "./Action.svelte";

  let {
    label,
    primary = false,
    disabled = false,
    working = false,
    href,
    onclick,
  }: {
    label: string;
    primary?: boolean;
    disabled?: boolean;
    working?: boolean;
    href?: string;
    onclick: () => void;
  } = $props();
</script>

<Action {primary} {disabled} {working} {href} {onclick}>{label}</Action>
