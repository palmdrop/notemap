import { cors } from "hono/cors";

export const corsMiddleware = cors({
  origin: "http://localhost:5173", // TODO: configure with env variable
});