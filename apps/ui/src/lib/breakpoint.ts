/**
 * `--breakpoint-narrow` in `tokens.css`, in pixels rather than `rem`: the one
 * place a breakpoint is read from script rather than drawn in CSS, since
 * nothing here draws — it only decides which page to land on.
 */
const NARROW_PX = 44 * 16;

export function narrow(): boolean {
  return window.innerWidth < NARROW_PX;
}
