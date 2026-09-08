/** Where a `create-or-append` path lands: a folder, and a name in it. */
export type Place = {
  readonly directory: string;
  /** Absent where the path named a folder alone, and the name is to be derived. */
  readonly filename?: string;
};

/**
 * A trailing `/` names a folder and an absent one names a file. Without the
 * slash there is nothing to tell `drafts` the new folder from `drafts` the new
 * extensionless note apart, and the answer cannot be looked up: the vault may
 * be unreachable when this is read.
 */
export function placeOf(path: string): Place {
  const segments = path.split("/").filter((segment) => segment !== "");

  if (path.endsWith("/") || segments.length === 0) {
    return { directory: segments.join("/") };
  }

  return {
    directory: segments.slice(0, -1).join("/"),
    filename: segments[segments.length - 1] as string,
  };
}
