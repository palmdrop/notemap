/** What the adapter itself decided, as opposed to what are.na said. */
export class Refused extends Error {}

/** are.na, or the network: something a later attempt may find different. */
export class Unreachable extends Error {}

/**
 * The token itself was refused. Its own class because the two callers read it
 * differently: a delivery retries one, the token having possibly just been
 * rotated, and a person asking now is owed the answer that it is wrong.
 */
export class TokenRefused extends Error {}
