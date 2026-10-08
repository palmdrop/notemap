/** What the adapter itself decided, as opposed to what the filesystem said. */
export class Refused extends Error {}

/**
 * A name taken between the walk and the write. A later attempt walks past
 * whatever took it, or finds its own copy there, so it is retried.
 */
export class Contended extends Error {}
