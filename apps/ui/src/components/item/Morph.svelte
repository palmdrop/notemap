<script lang="ts">
  import Icon from "$components/primitives/icon/Icon.svelte";

  /**
   * Previous and Next in the morph shape: two pills joined at a narrow neck,
   * a rule between them. The one shape kept from the morph variants.
   */
  let {
    onprevious,
    onnext,
  }: {
    /** Absent where there is none to step to. */
    onprevious: (() => void) | undefined;
    onnext: (() => void) | undefined;
  } = $props();
</script>

<span class="relative inline-flex h-11 w-20 flex-none">
  <svg
    aria-hidden="true"
    viewBox="0 0 88 44"
    class="pointer-events-none absolute inset-0 size-full fill-off stroke-off-line"
  >
    <path
      d="M22,0.5 H34 C39,0.5 41,8 44,8 C47,8 49,0.5 54,0.5 H66 A21.5,21.5 0 0 1 66,43.5 H54 C49,43.5 47,36 44,36 C41,36 39,43.5 34,43.5 H22 A21.5,21.5 0 0 1 22,0.5 Z"
    />
    <path d="M44,8 V36" fill="none" />
  </svg>
  <button
    type="button"
    disabled={onprevious === undefined}
    title="Previous ([)"
    onclick={() => onprevious?.()}
    class="relative grid flex-1 place-items-center rounded-l-full disabled:text-muted"
  >
    <Icon name="chevron-left" label="Previous" class="size-5" />
  </button>
  <button
    type="button"
    disabled={onnext === undefined}
    title="Next (])"
    onclick={() => onnext?.()}
    class="relative grid flex-1 place-items-center rounded-r-full disabled:text-muted"
  >
    <Icon name="chevron" label="Next" class="size-5" />
  </button>
</span>
