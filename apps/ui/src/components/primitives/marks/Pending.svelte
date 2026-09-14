<script lang="ts">
  let { inline = false }: { inline?: boolean } = $props();
</script>

<span class="w-max {inline ? 'inline-block' : 'mt-2 block'}">pending</span>
