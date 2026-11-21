type Doable = {
  readonly run: () => void | Promise<void>;
};

type Goes = {
  readonly href: string;
};

/**
 * A deed a person can take, published by whatever is on screen rather than
 * registered anywhere: an id a binding names, a word a person reads, the
 * deed, and why it cannot be taken. `run` or `href`, never both — `open` and
 * `history` are places rather than deeds, so a key on one is a `goto`.
 * `primary` and `alarm` are how the shell draws it, held here so a
 * button and a key never learn two different answers.
 */
export type Command = {
  readonly id: string;
  readonly label: string;
  readonly primary?: boolean;
  readonly alarm?: boolean;
  readonly refusal?: string;
  /** What a surface is searched by, for the header to draw the line that searches it. */
  readonly field?: {
    readonly words: string;
    readonly onsearch: (words: string, push: boolean) => void;
  };
  /** How many of it there are, drawn beside its icon: the tags a filter holds. */
  readonly count?: number;
  /** Fires even while a field has the caret: a route, and an edit's `save`. */
  readonly whileWriting?: boolean;
} & (Doable | Goes);
