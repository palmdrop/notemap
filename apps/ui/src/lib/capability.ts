/**
 * What a delivery did, in the words the glossary gives a capability. The names
 * are the wire's and are what a rule is written against, so one this shell has
 * never heard of is said by its name rather than not said at all.
 *
 * `create-or-append` names both acts because it is both until the adapter
 * reaches the destination, and nothing it reports back says which it turned out
 * to be.
 */
const DID: Record<string, string> = {
  create: "created",
  append: "appended",
  "create-or-append": "created or appended",
  "place-assets": "placed",
};

export function didWhat(capability: string): string {
  return DID[capability] ?? capability;
}

/** A capability that carries a capture's attachments and nothing else, as its schema says of itself. */
export function carriesAssets(capability: {
  readonly argumentsSchema?: Readonly<Record<string, unknown>>;
}): boolean {
  return capability.argumentsSchema?.["x-notemap-carries"] === "assets";
}
