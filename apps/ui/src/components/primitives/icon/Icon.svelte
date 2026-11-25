<script lang="ts" module>
  /** The sprite's icons, by the role each plays. */
  export type IconName =
    | "menu"
    | "plus"
    | "close"
    | "back"
    | "next"
    | "more"
    | "settings"
    | "bell"
    | "tag"
    | "link"
    | "image"
    | "attach"
    | "search"
    | "filter"
    | "trash"
    | "route"
    | "up"
    | "down"
    | "chevron"
    | "chevron-left"
    | "camera"
    | "check"
    | "undo"
    | "folder"
    | "file"
    | "cloud"
    | "grid"
    | "calendar"
    | "clock"
    | "edit"
    | "capture"
    | "copy"
    | "queue"
    | "feed"
    | "log"
    | "cloud-off"
    | "lock"
    | "unlock"
    | "link-off"
    | "refresh"
    | "pause"
    | "template"
    | "circle"
    | "circle-check";
</script>

<script lang="ts">
  /**
   * An icon supports a word and never stands for one, so it is hidden from a
   * reader unless `label` is given, which is for a button that is the icon
   * alone.
   */
  let {
    name,
    label,
    class: drawn = "size-icon",
  }: { name: IconName; label?: string; class?: string } = $props();
</script>

<svg
  class="shrink-0 {drawn}"
  data-icon={name}
  role={label === undefined ? undefined : "img"}
  aria-label={label}
  aria-hidden={label === undefined ? "true" : undefined}
  focusable="false"
>
  <use href="#i-{name}" />
</svg>
