<script lang="ts">
  /** In `pending`'s idiom, not `routed`'s: what this shell holds, never what became of the item. */
  let { inline = false }: { inline?: boolean } = $props();
</script>

<span class="w-max {inline ? 'inline-block' : 'mt-2 block'}">from cache</span>
