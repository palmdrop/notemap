<script lang="ts">
  import { timeOf } from "$lib/stamp";

  /**
   * Whether the pool answers, at the menu's foot, and who this is. Offline is
   * said in ink, with when the pool last answered.
   */
  let {
    reachable,
    at,
    who,
    compact = false,
  }: {
    reachable: boolean;
    at: string | undefined;
    who: string;
    compact?: boolean;
  } = $props();
</script>

{#if compact}
  <div class="flex h-foot items-center justify-center border-t border-rule">
    <span
      role="status"
      aria-label={reachable ? "online" : "offline"}
      title={reachable
        ? `online, ${who}`
        : `offline${at === undefined ? "" : `, last answered ${timeOf(at)}`}`}
      class="inline-block size-2 rounded-full {reachable
        ? 'bg-signal-ink'
        : 'border border-ink'}"
    ></span>
  </div>
{:else}
  <!-- One line, the height of the status line beside it: what does not fit
       is cut, and said whole on hover. -->
  <div
    class="flex h-foot items-center gap-2 border-t border-rule px-gutter text-small whitespace-nowrap"
  >
    {#if reachable}
      <span class="flex flex-none items-center gap-1.5 text-muted">
        <span class="inline-block size-2 rounded-full bg-signal-ink"></span>
        online
      </span>
    {:else}
      <span
        role="status"
        class="min-w-0 truncate"
        title={at === undefined
          ? "offline"
          : `offline, last answered ${timeOf(at)}`}
      >
        offline{#if at !== undefined}&nbsp;{timeOf(at)}{/if}
      </span>
    {/if}
    <span class="ml-auto min-w-0 truncate text-muted" title={who}>{who}</span>
  </div>
{/if}
