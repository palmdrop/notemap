export * from "./pool";

// Core owns which code each failure is reported under, so a host driving
// delivery work reports through these rather than inventing its own.
export { asDeliveryWorkOutcome, DELIVERY_FAILURE } from "./routing/delivery";

export { destinationRegistry } from "./destinations/registry";

// A kind adapter throws this from `describe()` to say a destination cannot
// be made sense of for a reason only it knows, rather than one merely
// unreachable — see `destinations/usability.ts`.
export { Unusable } from "./destinations/usability";

// And this from `candidates()`, for a field it does not answer for. The
// registry throws the same thing for an adapter that answers for none.
export { NotOffered } from "./destinations/candidates";
