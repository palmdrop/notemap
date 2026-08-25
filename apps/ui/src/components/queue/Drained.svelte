<script lang="ts">
  import Body from "$components/primitives/register/Body.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";

  const SAID = `The queue is empty.

Everything captured has been routed, marked done, or archived. Anything new goes in at the top.`;
</script>

<!-- No count: the pool gives none, and reaching the end is the only one. -->
<Rail>
  <div class="cleared"><StateWord word="zero" /></div>
</Rail>
<Body>
  <div class="cleared"><Prose text={SAID} /></div>
</Body>
