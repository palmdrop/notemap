<script lang="ts">
  /**
   * A fact and what qualifies it, told apart by weight rather than a mark
   * between them: `ok checked 2m ago`, the first word bold.
   */
  let { lead, rest }: { lead: string; rest?: string | undefined } = $props();
</script>

<span class="font-semibold">{lead}</span>
{#if rest !== undefined}
  <span>{rest}</span>
{/if}
