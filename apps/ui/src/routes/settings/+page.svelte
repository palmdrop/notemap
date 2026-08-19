<script lang="ts">
  import Destinations from "$components/destinations/Destinations.svelte";
  import ActionRow from "$components/primitives/controls/ActionRow.svelte";
  import Label from "$components/primitives/register/Label.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import Row from "$components/primitives/register/Row.svelte";
</script>

<Register>
  <Row>
    <Label name="daemon" />
    <ActionRow>
      <!-- The daemon serves these, not this app: let the browser leave. -->
      <a href="/log" data-sveltekit-reload>log</a>
      <a href="/docs" data-sveltekit-reload>api</a>
    </ActionRow>
  </Row>

  <Destinations />
</Register>
