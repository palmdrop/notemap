export * from "./pool";

// What a host driving delivery work needs, and nothing else of routing's:
// core owns which code each failure is reported under, because the abandoned
// surface's promise that they are distinguishable rests on it.
export { asDeliveryWorkOutcome, DELIVERY_FAILURE } from "./routing/delivery";
