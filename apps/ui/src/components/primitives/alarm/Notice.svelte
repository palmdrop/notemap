<script lang="ts">
  /**
   * Something that has already happened, said to somebody who did not ask. The
   * accent is spent where it may want acting on; a confirmation is the ink.
   */
  let {
    what,
    why,
    href,
    standing = false,
    ondismiss,
  }: {
    what: string;
    why?: string;
    href?: string;
    standing?: boolean;
    ondismiss?: () => void;
  } = $props();
</script>

<div
  role={standing ? "alert" : "status"}
  class="grid gap-1.5 px-3 py-2.5 text-paper {standing
    ? 'bg-accent'
    : 'bg-ink'}"
>
  <span class="break-words">{what}</span>

  {#if why !== undefined}
    <span class="break-words">{why}</span>
  {/if}

  {#if href !== undefined || ondismiss !== undefined}
    <span class="flex justify-end gap-4">
      {#if href !== undefined}
        <a {href} class="underline">look</a>
      {/if}

      {#if ondismiss !== undefined}
        <button type="button" onclick={ondismiss} class="underline">
          dismiss
        </button>
      {/if}
    </span>
  {/if}
</div>
