<script lang="ts">
  import { saidBy, type Item } from "@notemap/client";

  import EditAction from "$components/queue/EditAction.svelte";
  import RouteAction from "$components/queue/RouteAction.svelte";
  import Tags from "$components/queue/Tags.svelte";
  import { client } from "$lib/client";

  let { item, offline }: { item: Item; offline: boolean } = $props();

  let said = $state("");

  const images = $derived(client.images(item));
  const text = $derived(client.says(item));

  async function markDone() {
    said = "marking…";
    try {
      await client.routing.markProcessed(item.id);
    } catch (error) {
      said = saidBy(error);
    }
  }
</script>

<li class="grid gap-2 bg-white p-3 dark:bg-neutral-900">
  {#each images as image (image)}
    <img src={image} alt="" loading="lazy" class="max-w-full rounded-sm" />
  {/each}

  {#if text !== ""}
    <p class="m-0 break-words whitespace-pre-wrap">{text}</p>
  {/if}

  <Tags {item} />

  <div class="flex flex-wrap items-baseline gap-3 text-sm">
    <!-- An archive, an edit and a tag replay from the outbox; a delivery
         cannot, so it is not offered rather than promised. -->
    <button
      type="button"
      onclick={() => void client.archive(item.id)}
      class="underline"
    >
      Archive
    </button>

    <button
      type="button"
      onclick={markDone}
      disabled={offline}
      class="underline disabled:no-underline disabled:opacity-50"
    >
      Mark done
    </button>

    <EditAction {item} />

    <RouteAction item={item.id} disabled={offline} />

    {#if offline}
      <span class="text-neutral-500 dark:text-neutral-400">
        routing needs the daemon; triage does not
      </span>
    {/if}

    {#if said !== ""}
      <span role="status" class="text-neutral-500">{said}</span>
    {/if}
  </div>
</li>
