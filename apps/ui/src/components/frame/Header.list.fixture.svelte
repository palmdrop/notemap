<script lang="ts">
  import { publish } from "$lib/command/stack.svelte";
  import { searching } from "./searching.svelte";
  import { selects, type Selecting } from "$lib/selecting.svelte";

  import Header from "./Header.svelte";

  let {
    filtered = 0,
    chosen,
    onfilter = () => {},
  }: {
    filtered?: number;
    chosen?: Selecting;
    onfilter?: () => void;
  } = $props();

  let words = $state("");

  publish(() => [
    { id: "filter", label: "filter", count: filtered, run: onfilter },
    {
      id: "search",
      label: "search",
      field: { words, onsearch: (now: string) => (words = now) },
      run: () => searching.focus(),
    },
  ]);

  selects(() => chosen);
</script>

<Header title="queue" list onmenu={() => {}} />
