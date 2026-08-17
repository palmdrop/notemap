<script lang="ts">
  import { client } from "$lib/client";

  const outbox = client.outbox;

  const troubled = $derived(
    $outbox.filter((held) => held.failure !== undefined),
  );
</script>

{#if troubled.length > 0}
  <ul class="mt-4 grid list-none gap-2 p-0">
    {#each troubled as held (held.id)}
      <li
        class="flex items-baseline justify-between gap-3 rounded-lg border border-red-300 px-3 py-2 text-sm dark:border-red-800"
      >
        <span class="break-words">
          {held.operation.kind}: {held.failure}
          {#if held.state === "unreachable"}
            <em class="text-neutral-500 not-italic">— waiting for the daemon</em
            >
          {/if}
        </span>

        {#if held.state === "refused"}
          <button
            type="button"
            onclick={() => void client.dismiss(held.id)}
            class="shrink-0 underline"
          >
            Dismiss
          </button>
        {:else}
          <button
            type="button"
            onclick={() => void client.drain()}
            class="shrink-0 underline"
          >
            Retry
          </button>
        {/if}
      </li>
    {/each}
  </ul>
{/if}
