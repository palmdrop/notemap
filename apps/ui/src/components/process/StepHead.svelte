<script lang="ts">
  /** A step's name over it, when wide; on a phone the header says which step. */
  let { name, phone }: { name: string; phone: boolean } = $props();
</script>

{#if !phone}
  <h2
    class="m-0 border-b border-rule px-gutter pt-5 pb-3 font-display text-title font-normal lowercase"
  >
    {name}
  </h2>
{/if}
