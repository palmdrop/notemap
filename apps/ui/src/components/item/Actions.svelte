<script lang="ts">
  import { saidBy, type Item } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import ActionRow from "$components/primitives/controls/ActionRow.svelte";
  import { client } from "$lib/client";
  import { editable } from "$lib/lineage";

  /** `said` is what the caller has to report; marking done reports its own. */
  let {
    item,
    offline,
    said = "",
    onroute,
    onedit,
  }: {
    item: Item;
    offline: boolean;
    said?: string;
    onroute: () => void;
    onedit: () => void;
  } = $props();

  let reported = $state("");

  const mayEdit = $derived(editable(item));
  const word = $derived(reported === "" ? said : reported);

  async function markDone() {
    reported = "marking…";
    try {
      await client.routing.markProcessed(item.id);
      reported = "";
    } catch (error) {
      reported = saidBy(error);
    }
  }
</script>

<ActionRow>
  <!-- An archive, an edit and a tag replay from the outbox; a delivery
       cannot, so it is not offered rather than promised. -->
  <Action primary disabled={offline} onclick={onroute}>route</Action>
  <Action disabled={offline} onclick={markDone}>mark done</Action>
  <Action onclick={() => void client.archive(item.id)}>archive</Action>
  <!-- A processed item is not this row's to rewrite: editing it would
       append a revision, which the queue is not where to do. -->
  {#if mayEdit}
    <Action onclick={onedit}>edit</Action>
  {/if}

  {#if word !== ""}
    <span role="status" class="text-ink-muted">{word}</span>
  {/if}
</ActionRow>
