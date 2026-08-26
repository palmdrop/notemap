<script lang="ts">
  import Body from "$components/primitives/register/Body.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import { DRAINED } from "$lib/said";
</script>

<!-- No count: the pool gives none, and reaching the end is the only one. -->
<Rail>
  <div class="cleared"><StateWord word="zero" /></div>
</Rail>
<Body>
  <div class="cleared"><Prose text={DRAINED} /></div>
</Body>
