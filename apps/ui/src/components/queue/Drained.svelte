<script lang="ts">
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
</script>

<!-- Reaching the end is what the queue is for, so it is said the way the shell
     says everything else it has done: once, quietly, and in the rail. No count,
     because the pool gives none. -->
<Rail>
  <div class="cleared">nothing waiting</div>
</Rail>
<Body></Body>
