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
  create: "Created",
  append: "Appended",
  "create-or-append": "Created or appended",
};

export function didWhat(capability: string): string {
  return DID[capability] ?? capability;
}
