import { z } from "zod";

/** Open-ended JSON: a payload's content, an action's detail. */
export const jsonObject = z.record(z.string(), z.unknown());
