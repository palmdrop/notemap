<script lang="ts">
  import Daemon from "$components/settings/Daemon.svelte";
  import Destinations from "$components/settings/Destinations.svelte";
  import Page from "$components/settings/Page.svelte";
  import Session from "$components/session/Session.svelte";
  import Templates from "$components/settings/Templates.svelte";
  import Tokens from "$components/settings/Tokens.svelte";
</script>

<Page lede="What this pool can reach, and where it keeps things.">
  <Destinations />
  <Templates />
  <Daemon />
  <Session />
  <Tokens />
</Page>
