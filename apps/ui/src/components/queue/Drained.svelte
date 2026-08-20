<script lang="ts">
  import Content from "$components/primitives/register/Content.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import Row from "$components/primitives/register/Row.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";

  const SAID = `The queue is empty.

Everything captured has been routed, marked done, or archived. Anything new goes in at the top.`;
</script>

<!--
  The state word in the left column, where the feed puts what became of an item:
  this is what became of the whole surface. No count is claimed, because the
  pool gives none — reaching the end is the only number the queue ever has.
-->
<div class="cleared">
  <Row>
    <StateWord word="zero" />
    <Content>
      <Prose text={SAID} />
    </Content>
  </Row>
</div>
