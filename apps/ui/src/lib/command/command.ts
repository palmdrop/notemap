/** The two tiers `Actions` draws a command in, and nothing else. */
export type Group = "decide" | "work";

export const DECIDE: Group = "decide";
export const WORK: Group = "work";

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
 * `primary`, `alarm` and `group` are how the shell draws it, held here so a
 * button and a key never learn two different answers.
 */
export type Command = {
  readonly id: string;
  readonly label: string;
  /** Which tier `Actions` draws it in, absent where its control is its own — the row's `+`. */
  readonly group?: Group;
  readonly primary?: boolean;
  readonly alarm?: boolean;
  readonly refusal?: string;
  /** Fires even while a field has the caret. Only a destination's route does today. */
  readonly whileWriting?: boolean;
} & (Doable | Goes);
