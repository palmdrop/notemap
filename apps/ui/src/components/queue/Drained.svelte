<script lang="ts">
  import Body from "$components/primitives/register/Body.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";

  const SAID = `The queue is empty.

Everything captured has been routed, marked done, or archived. Anything new goes in at the top.`;
</script>

<!--
  The state word in the rail, where the feed puts what became of an item: this
  is what became of the whole surface. No count is claimed, because the pool
  gives none — reaching the end is the only number the queue ever has.
-->
<Rail>
  <div class="cleared"><StateWord word="zero" /></div>
</Rail>
<Body>
  <div class="cleared"><Prose text={SAID} /></div>
</Body>
