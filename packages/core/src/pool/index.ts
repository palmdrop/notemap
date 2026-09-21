export * from "./pool";

// Core owns which code each failure is reported under, so a host driving
// delivery work reports through these rather than inventing its own.
export { asDeliveryWorkOutcome, DELIVERY_FAILURE } from "./routing/delivery";

export { destinationRegistry } from "./destinations/registry";

// The words notemap itself puts in an adapter's schema and reads back out, so
// nothing has to know a kind's capabilities by name.
export {
  ANNOTATIONS,
  ASKABLE_FIELD,
  FOLDER_ARGUMENT,
  INHERITS_FIELD,
  OFFERED_ONLY_FIELD,
  OFFERED_WHEN_FIELD,
  PATH_FIELD,
  pathField,
} from "./destinations/vocabulary";

// A kind adapter throws this from `describe()` to say a destination cannot
// be made sense of for a reason only it knows, rather than one merely
// unreachable — see `destinations/usability.ts`.
export { Unusable } from "./destinations/usability";

// And this from `candidates()`, for a field it does not answer for. The
// registry throws the same thing for an adapter that answers for none.
export { NotOffered } from "./destinations/candidates";

// And this from `probe()`. Every other throw from probing reads as unreachable.
export { Rejected } from "./destinations/probe";

// What a capture may be. A host puts this on the pool config it builds, since
// a second type is a code change everywhere one is read.
export { PAYLOAD_TYPES } from "./payload";
