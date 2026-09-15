<script lang="ts">
  import Fixture from "./stack.fixture.svelte";
  import { publish } from "./stack.svelte";

  let { id, inside }: { id: string; inside: string } = $props();

  publish(() => [{ id, label: id, run: () => undefined }]);
</script>

<Fixture id={inside} />
