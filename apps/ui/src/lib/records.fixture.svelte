<script lang="ts">
  import { recordsOf } from "./records.svelte";

  /** `version` stands for the item's summary changing under the same id. */
  let { id, version }: { id: string; version: number } = $props();

  const records = recordsOf(
    () => {
      void version;
      return id;
    },
    () => true,
  );
</script>

<span data-testid="records">{records.all.map((one) => one.id).join(",")}</span>
