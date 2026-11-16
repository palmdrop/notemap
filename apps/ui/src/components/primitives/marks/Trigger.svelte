<script lang="ts">
  import Icon from "$components/primitives/icon/Icon.svelte";
  import { TRIGGER_NAMESPACE } from "$lib/trigger";

  /** A trigger tag, drawn as the route icon and its name, never as `#route/…`. */
  let { tag }: { tag: string } = $props();

  const name = $derived(
    tag.startsWith(TRIGGER_NAMESPACE)
      ? tag.slice(TRIGGER_NAMESPACE.length)
      : tag,
  );
</script>

<span
  class="inline-flex items-center gap-1 rounded-tag border border-ink px-1.5 py-px text-small"
  title={tag}><Icon name="route" class="size-3.5" /><span>{name}</span></span
>
