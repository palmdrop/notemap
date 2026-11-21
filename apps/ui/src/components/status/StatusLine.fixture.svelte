<script lang="ts">
  import Bell from "./Bell.svelte";
  import StatusLine from "./StatusLine.svelte";

  /** The line as the shell draws it: under the bell that also opens its notices. */
  let { shut = false }: { shut?: boolean } = $props();
</script>

{#if !shut}<Bell />{/if}
<StatusLine {shut} />
