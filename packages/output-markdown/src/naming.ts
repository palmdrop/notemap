/**
 * What a note will be called and where it will land, with nothing behind it —
 * no core types, no markdown, no filesystem. The shell reads this to say what
 * is about to happen before it commits, and reading the same code is what stops
 * the forecast and the delivery from drifting into two answers.
 */
export { filenameFrom } from "./filename";
export { placeOf, type Place } from "./place";
