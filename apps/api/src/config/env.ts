import "dotenv/config";
import { z } from "zod";
const schema=z.object({NODE_ENV:z.enum(["development","test","production"]).default("development"),PORT:z.coerce.number().int().min(1).max(65535).default(4000),API_PREFIX:z.string().default("/api/v1"),WEB_ORIGIN:z.string().url().default("http://localhost:5173"),
  MONGODB_URI:z.string().url().optional(),LOG_LEVEL:z.enum(["fatal","error","warn","info","debug","trace","silent"]).default("info")});
const parsed=schema.safeParse(process.env);
if(!parsed.success){console.error("Invalid environment configuration:",parsed.error.flatten().fieldErrors);process.exit(1);}
export const env=parsed.data;
