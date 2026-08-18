export * from "./pool";

// Core owns which code each failure is reported under, so a host driving
// delivery work reports through these rather than inventing its own.
export { asDeliveryWorkOutcome, DELIVERY_FAILURE } from "./routing/delivery";

// The port over one adapter per kind. Which adapters is the host's; dispatching
// to the one that speaks a row's kind is the same wherever it is done.
export { destinationRegistry } from "./destinations/registry";
