import { TRIGGER_TAG_NAMESPACE } from "@notemap/core";
import type { JsonObject, JsonSchema, Tag } from "@notemap/core";

/**
 * Where a note carries its tags. `frontmatter` is where they went before this
 * existed, so a destination that never said keeps writing what it wrote — and
 * a destination writing no frontmatter carries none, which it also already did.
 */
export type TagsMode = "frontmatter" | "hashtags" | "none";

export const TAGS = "tags";

const MODES = ["frontmatter", "hashtags", "none"] as const;

/** The destination's own default, on the same terms as the frontmatter setting. */
export const TAGS_SETTING: JsonSchema = {
  type: "string",
  enum: [...MODES],
  default: "frontmatter",
  title: "Tags",
  description:
    "Where a note this destination writes carries its tags: among the frontmatter, as `#tag` at the foot of the note, or nowhere. Frontmatter that is switched off carries none of it either way.",
};

/** The same choice for one capture. Left unset, the destination's own decides. */
export const TAGS_MODE: JsonSchema = {
  type: "string",
  enum: [...MODES],
  title: "tags",
  description:
    "Where this note carries its tags. Left unset, the destination's own setting decides.",
};

/** Absent inherits the destination's setting, and an absent setting is `frontmatter`. */
export function tagsModeOf(
  args: JsonObject,
  setting: TagsMode = "frontmatter",
): TagsMode {
  return modeOf(args[TAGS]) ?? setting;
}

/** Read rather than cast, as a settings reader reads everything else. */
export function tagsSettingOf(settings: JsonObject): TagsMode | undefined {
  return modeOf(settings[TAGS]);
}

function modeOf(held: unknown): TagsMode | undefined {
  return typeof held === "string" && (MODES as readonly string[]).includes(held)
    ? (held as TagsMode)
    : undefined;
}

export const TRIGGER_TAGS = "triggerTags";

/**
 * Whether the tags that filed the item go with it. They are the pool's record
 * of why an item went where it went rather than anything about the item, so a
 * delivery that was not asked leaves them behind, in the frontmatter as in the
 * foot of the note.
 */
export const TRIGGER_TAGS_ARGUMENT: JsonSchema = {
  type: "boolean",
  default: false,
  title: "trigger tags",
  description:
    "Whether the `route/` tags that filed this item are written with its other tags. Left unset, they stay in the pool.",
};

/** Only `true` says yes; absent and anything else is the default. */
export function triggerTagsOf(args: JsonObject): boolean {
  return args[TRIGGER_TAGS] === true;
}

/** The names a note is asked to write, in the order the item holds them. */
export function carriedTags(
  tags: readonly Tag[],
  triggerTags: boolean,
): readonly string[] {
  return tags
    .map((tag) => tag.name)
    .filter((name) => triggerTags || !name.startsWith(TRIGGER_TAG_NAMESPACE));
}

/** Nothing ends a hashtag but a space, so a tag holding one cannot be written as one. */
const UNWRITABLE = /\s/;

export type Hashtags = {
  /** The tags as one line, empty where none of them could be written. */
  readonly line: string;
  /** The ones a hashtag cannot be made of, in the words somebody wrote them in. */
  readonly unwritable: readonly string[];
};

/**
 * A tag a hashtag cannot hold is left out rather than rewritten: a tag is
 * somebody's word for something, and `#my-note` is not the tag they wrote.
 */
export function hashtagsFor(names: readonly string[]): Hashtags {
  const writable = names.filter((name) => !UNWRITABLE.test(name));

  return {
    line: writable.map((name) => `#${name}`).join(" "),
    unwritable: names.filter((name) => UNWRITABLE.test(name)),
  };
}
