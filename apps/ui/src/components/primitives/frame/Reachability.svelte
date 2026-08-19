<script lang="ts">
  let { yes }: { yes: boolean } = $props();
</script>

<!-- Stated once, for the whole shell. No row repeats it. -->
<span role="status" class={yes ? undefined : "text-accent"}>
  {yes ? "online" : "offline"}
</span>
