import {
  INHERITS_FIELD,
  OFFERED_WHEN_FIELD,
  TRIGGER_TAG_NAMESPACE,
} from "@notemap/core";
import type { JsonObject, JsonSchema, Tag } from "@notemap/core";

import { FRONTMATTER } from "./frontmatter";

export const HASHTAGS = "hashtags";

/**
 * Whether a note carries its tags as `#tag` at its foot. Off, they go among
 * the frontmatter, and nowhere where there is none — so where a note carries
 * them is one switch beside the frontmatter's, and every setting of the two
 * means something.
 */
export const HASHTAGS_SETTING: JsonSchema = {
  type: "boolean",
  default: false,
  title: "Hashtags",
  description:
    "Whether a note this destination writes carries its tags as `#tag` at its foot. Otherwise they go among the frontmatter, and nowhere where none is written.",
};

/** The same choice for one capture, on the frontmatter argument's terms. */
export const HASHTAGS_ARGUMENT: JsonSchema = {
  type: "boolean",
  default: false,
  title: "hashtags",
  description:
    "Whether this note carries its tags as `#tag` at its foot. Left unset, the destination's own setting decides.",
  [INHERITS_FIELD]: true,
};

/** Absent inherits the destination's setting, and an absent setting is off. */
export function hashtagsOf(args: JsonObject, setting = false): boolean {
  return flagOf(args[HASHTAGS]) ?? setting;
}

/** Read rather than cast, as a settings reader reads everything else. */
export function hashtagsSettingOf(settings: JsonObject): boolean | undefined {
  return flagOf(settings[HASHTAGS]);
}

function flagOf(held: unknown): boolean | undefined {
  return typeof held === "boolean" ? held : undefined;
}

export const TRIGGER_TAGS = "triggerTags";

/**
 * Whether the tags that filed the item go with it. They are the pool's record
 * of why an item went where it went rather than anything about the item, so a
 * delivery that was not asked leaves them behind, in the frontmatter as in the
 * foot of the note. Offered only while the tags go somewhere at all.
 */
export const TRIGGER_TAGS_ARGUMENT: JsonSchema = {
  type: "boolean",
  title: "trigger tags",
  description:
    "Whether the `route/` tags that filed this item are written with its other tags. Left unset, they stay in the pool.",
  [OFFERED_WHEN_FIELD]: [
    { field: FRONTMATTER, is: ["full"] },
    { field: HASHTAGS, is: [true] },
  ],
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
