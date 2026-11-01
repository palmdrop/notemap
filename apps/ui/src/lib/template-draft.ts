import type {
  Destination,
  Item,
  RoutingRecord,
  RoutingTemplate,
} from "@notemap/client";
import { filenameFrom, placeOf } from "@notemap/output-markdown/naming";

/** Where a template saved from a routing record starts: what the form opens holding. */
export type RoutingTemplateDraft = {
  readonly destination: string;
  readonly capability: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly folder: RoutingTemplate["folder"];
  /** The record went with words of its own, which a template never carries. */
  readonly rewriteLeft: boolean;
};

/**
 * Whether a record is worth saving as a template: one made by hand to a
 * destination that is still there, and still standing. A template's own
 * record already is one.
 */
export function templatable(
  record: RoutingRecord,
  destinations: readonly Destination[],
): boolean {
  const target = record.target;
  return (
    target.kind === "destination" &&
    record.applied === undefined &&
    record.withdrawnAt === undefined &&
    destinations.some((one) => one.id === target.destination)
  );
}

/**
 * The record's decision as a template: the same destination, capability and
 * arguments, nothing asked and no trigger tag. A note's name that is the one
 * this item was given, or a free one beside it, is left off, so the template
 * names each item's note for that item. A name somebody typed stays.
 */
export function draftOf(
  record: RoutingRecord,
  item: Item,
  destinations: readonly Destination[],
): RoutingTemplateDraft | undefined {
  const target = record.target;
  if (target.kind !== "destination" || !templatable(record, destinations)) {
    return undefined;
  }

  const derived = filenameFrom(target.content ?? item.payload.content, item.id);
  const { folder, ...kept } = target.arguments;

  return {
    destination: target.destination,
    capability: target.capability,
    arguments: withoutDerivedLeaf(target.capability, kept, derived),
    folder: folder === "require" ? "require" : "create",
    rewriteLeft: target.content !== undefined,
  };
}

/**
 * Only where the capability derives a name when given none. `append` names its
 * note outright, and a path without its leaf would name a folder it refuses.
 */
function withoutDerivedLeaf(
  capability: string,
  args: Record<string, unknown>,
  derived: string,
): Record<string, unknown> {
  const { path, filename } = args;

  if (capability === "create-or-append" && typeof path === "string") {
    const place = placeOf(path);
    if (place.filename !== undefined && isDerived(place.filename, derived)) {
      return {
        ...args,
        path: place.directory === "" ? "" : `${place.directory}/`,
      };
    }
  }

  if (
    capability === "create" &&
    typeof filename === "string" &&
    isDerived(filename, derived)
  ) {
    const { filename: _derived, ...rest } = args;
    return rest;
  }

  return args;
}

/** `name.md`, or `name-1.md`, `name-2.md`, … beside it. */
function isDerived(name: string, derived: string): boolean {
  if (name === derived) return true;

  const dot = derived.lastIndexOf(".");
  const stem = dot > 0 ? derived.slice(0, dot) : derived;
  const extension = dot > 0 ? derived.slice(dot) : "";
  if (!name.startsWith(`${stem}-`) || !name.endsWith(extension)) return false;

  const step = name.slice(stem.length + 1, name.length - extension.length);
  return /^[1-9]\d*$/.test(step);
}
