<script lang="ts">
  import { reachable, watched } from "./reachable.svelte";

  watched();
  const pool = reachable();
</script>

<span>{pool.known ? (pool.yes ? "reachable" : "offline") : "not known"}</span>
