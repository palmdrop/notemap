import { goto, replaceState } from "$app/navigation";
import { page } from "$app/state";

/**
 * How a page was come to: whether from inside the shell, and through how many
 * steps of Previous and Next, `[` and `]`, since. Each step is an entry of its
 * own, so the system's back walks back through them; leaving goes back past
 * all of them at once to where the walk began.
 */
type Trail = { readonly within: boolean; readonly steps: number };

const here = (): Trail | undefined => page.state?.trail;

/**
 * Said once of each entry as it is arrived at, and kept with the entry, so a
 * step come back to by the system's back still knows its place.
 */
export function arrived(within: boolean): void {
  if (here() === undefined) {
    replaceState("", { ...page.state, trail: { within, steps: 0 } });
  }
}

export const trail = {
  /** Whether the walk began inside the shell, so leaving can go back to it. */
  get within(): boolean {
    return here()?.within ?? false;
  },
  get steps(): number {
    return here()?.steps ?? 0;
  },
  /** The item a decision just moved on from, which this one's bar speaks of. */
  get left(): string | undefined {
    return page.state?.left;
  },
  /** On to a neighbour, as an entry of its own. */
  step(href: string): Promise<void> {
    const at = here() ?? { within: false, steps: 0 };
    return goto(href, { state: { trail: { ...at, steps: at.steps + 1 } } });
  },
  /** On to a neighbour in this entry's place, as a decision moves on. */
  moveOn(
    href: string,
    state: Omit<App.PageState, "trail"> = {},
  ): Promise<void> {
    const at = here();
    return goto(href, {
      replaceState: true,
      state: at === undefined ? state : { ...state, trail: at },
    });
  },
  /** Back to where the walk began, or to `home` where it began outside the shell. */
  leave(home: string): void {
    if (trail.within) history.go(-(trail.steps + 1));
    else void goto(home, { replaceState: true });
  },
};
