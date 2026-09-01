import { type AlgorithmName } from ".";

export const DEFAULT_ALGORITHM: AlgorithmName = "scrypt";
export const MAX_PASSWORD_BYTE_LENGTH = 4096;

/** Characters, where the maximum is bytes: one guards a person, the other a hash. */
export const MIN_PASSWORD_LENGTH = 12;
