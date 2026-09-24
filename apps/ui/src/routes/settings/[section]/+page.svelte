<script lang="ts">
  import Access from "$components/settings/Access.svelte";
  import Accounts from "$components/settings/Accounts.svelte";
  import Appearance from "$components/settings/Appearance.svelte";
  import Destinations from "$components/settings/Destinations.svelte";
  import Server from "$components/settings/Server.svelte";
  import Templates from "$components/settings/Templates.svelte";
  import type { Section } from "$components/settings/href";

  let { data }: { data: { section: Section } } = $props();
</script>

{#if data.section === "destinations"}
  <Destinations />
{:else if data.section === "templates"}
  <Templates />
{:else if data.section === "accounts"}
  <Accounts />
{:else if data.section === "access"}
  <Access />
{:else if data.section === "server"}
  <Server />
{:else}
  <Appearance />
{/if}
