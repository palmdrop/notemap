/**
 * A page that is not a list draws its own head: a way out in place of the
 * menu, its own title, what it is on at the right (a route's step), and a line
 * under it saying what it is about. Set while the page is mounted.
 */
export type Heading = {
  readonly title: string;
  /** Close leaves something under way, back goes up a level. None, and the menu stands. */
  readonly out?: {
    readonly icon: "close" | "back";
    readonly label: string;
    readonly run: () => void;
  };
  readonly aside?: string;
  readonly under?: string;
};

let current = $state.raw<Heading | undefined>(undefined);

export const heading = {
  get current(): Heading | undefined {
    return current;
  },
};

/** Registers the page's head for as long as the calling component lives. */
export function headed(read: () => Heading | undefined): void {
  $effect(() => {
    const now = read();
    if (now === undefined) return;
    current = now;
    return () => {
      if (current === now) current = undefined;
    };
  });
}
