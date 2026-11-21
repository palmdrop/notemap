<script lang="ts">
  import Icon from "$components/primitives/icon/Icon.svelte";
  import { fade } from "$lib/motion";
  import { notices } from "$lib/notices.svelte";

  /**
   * The one popup: a delivery turned down after its window closed, said once
   * in red under the header. The row says it too, and the notices keep it.
   */
  const said = $derived(notices.strip);
</script>

{#if said !== undefined}
  <div
    role="alert"
    transition:fade
    class="sticky top-bar z-30 flex items-center gap-2 bg-danger pl-gutter text-paper"
  >
    <p class="min-w-0 flex-1 py-2">
      {said.what}
      {#if said.subject !== undefined}<b>{said.subject}</b>{/if}
      {#if said.why !== undefined}<span class="block text-small"
          >{said.why}</span
        >{/if}
    </p>
    {#if said.href !== undefined}
      <a
        href={said.href}
        onclick={() => notices.unstrip()}
        class="underline underline-offset-[0.2em]">Show</a
      >
    {/if}
    <button
      type="button"
      onclick={() => notices.unstrip()}
      class="grid min-h-target min-w-target place-items-center"
    >
      <Icon name="close" label="Dismiss" class="size-5" />
    </button>
  </div>
{/if}
