<script lang="ts">
  import { reachable, watched } from "./reachable.svelte";

  watched();
  const pool = reachable();
</script>

<span>{pool.yes ? "reachable" : "offline"}</span>
