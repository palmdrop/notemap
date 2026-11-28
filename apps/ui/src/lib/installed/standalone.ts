/** Opened as an installed app, from its icon, rather than in a browser's tab. */
export function installed(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches
  );
}
