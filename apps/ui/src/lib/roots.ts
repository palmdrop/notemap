/**
 * Whether `candidate` is `known`, or sits under it — a check against a typo,
 * not a resolution: the shell has no way to expand `~` or resolve a symlink,
 * so this compares the text as typed against the text a destination was last
 * saved with.
 */
export function isFamiliarRoot(
  candidate: string,
  known: readonly string[],
): boolean {
  const target = withoutTrailingSlash(candidate.trim());
  if (target === "") return true;

  return known.some((each) => {
    const base = withoutTrailingSlash(each.trim());
    return base !== "" && (target === base || target.startsWith(`${base}/`));
  });
}

function withoutTrailingSlash(path: string): string {
  return path.replace(/\/+$/, "");
}
