export * from "./pool";

// Core owns which code each failure is reported under, so a host driving
// delivery work reports through these rather than inventing its own.
export { asDeliveryWorkOutcome, DELIVERY_FAILURE } from "./routing/delivery";

export { destinationRegistry } from "./destinations/registry";

// What an adapter marks a field with so core need not know its capabilities by
// name. A kind that writes into folders marks the field a folder mode is about.
export {
  ANNOTATIONS,
  ASKABLE_FIELD,
  PATH_FIELD,
  pathField,
} from "./destinations/annotations";

// A kind adapter throws this from `describe()` to say a destination cannot
// be made sense of for a reason only it knows, rather than one merely
// unreachable — see `destinations/usability.ts`.
export { Unusable } from "./destinations/usability";

// And this from `candidates()`, for a field it does not answer for. The
// registry throws the same thing for an adapter that answers for none.
export { NotOffered } from "./destinations/candidates";

// And this from `probe()`. Every other throw from probing reads as unreachable.
export { Rejected } from "./destinations/probe";
