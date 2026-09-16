<script lang="ts">
  import Account from "$components/settings/Account.svelte";
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
{:else if data.section === "account"}
  <Account />
{:else if data.section === "server"}
  <Server />
{:else}
  <Appearance />
{/if}
