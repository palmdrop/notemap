<script lang="ts">
  import Daemon from "$components/settings/Daemon.svelte";
  import Destinations from "$components/settings/Destinations.svelte";
  import Page from "$components/settings/Page.svelte";
</script>

<Page lede="What this pool can reach, and where it keeps things.">
  <Destinations />
  <Daemon />
</Page>
