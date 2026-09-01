/** What the adapter itself decided, as opposed to what the server said. */
export class Refused extends Error {}

/** The server, or the network, or the credential: something a later attempt may find different. */
export class Unreachable extends Error {}
