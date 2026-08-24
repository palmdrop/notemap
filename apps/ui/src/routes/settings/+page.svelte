<script lang="ts">
  import Destinations from "$components/destinations/Destinations.svelte";
  import ActionRow from "$components/primitives/controls/ActionRow.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
</script>

<Register>
  <Rail first>daemon</Rail>
  <Body first>
    <ActionRow>
      <!-- The daemon serves these, not this app: let the browser leave. -->
      <a href="/log" data-sveltekit-reload>log</a>
      <a href="/docs" data-sveltekit-reload>api</a>
    </ActionRow>
  </Body>

  <Destinations />
</Register>
