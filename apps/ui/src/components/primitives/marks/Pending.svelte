<script lang="ts">
  let { inline = false }: { inline?: boolean } = $props();
</script>

<span
  class="w-max font-mono text-ink-muted {inline
    ? 'inline-block'
    : 'mt-2 block'}">pending</span
>
