<script lang="ts">
  import Appearance from "$components/settings/Appearance.svelte";
  import Daemon from "$components/settings/Daemon.svelte";
  import Destinations from "$components/settings/Destinations.svelte";
  import Page from "$components/settings/Page.svelte";
  import Session from "$components/session/Session.svelte";
  import Sources from "$components/settings/Sources.svelte";
  import Templates from "$components/settings/Templates.svelte";
  import Tokens from "$components/settings/Tokens.svelte";
</script>

<Page>
  <Destinations />
  <Templates />
  <Sources />
  <Daemon />
  <Session />
  <Tokens />
  <Appearance />
</Page>
