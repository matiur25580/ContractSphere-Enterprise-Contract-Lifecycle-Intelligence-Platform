import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PREFIX: z.string().default("/api/v1"),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  MONGODB_URI: z.string().url().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  JWT_ACCESS_SECRET: z.string().min(32).default("local-development-only-change-this-secret"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().url().optional(),
  AI_API_KEY: z.string().min(1).optional(),
  AI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  AI_MODEL: z.string().trim().min(1).max(120).default("gpt-4.1-mini")
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === "production" && !process.env.JWT_ACCESS_SECRET) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["JWT_ACCESS_SECRET"], message: "JWT_ACCESS_SECRET is required in production." });
  }
  if (value.NODE_ENV === "production" && !value.MONGODB_URI) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["MONGODB_URI"], message: "MONGODB_URI is required in production." });
  }
  if (value.NODE_ENV === "production") {
    const webOrigin = new URL(value.WEB_ORIGIN);
    if (webOrigin.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(webOrigin.hostname)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["WEB_ORIGIN"], message: "WEB_ORIGIN must be a non-local HTTPS origin in production." });
    }
  }
  const storageValues = [value.S3_BUCKET, value.S3_REGION, value.S3_ACCESS_KEY_ID, value.S3_SECRET_ACCESS_KEY];
  if (storageValues.some(Boolean) && storageValues.some(item => !item)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["S3_BUCKET"], message: "S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY must be configured together." });
  }
  if (value.NODE_ENV === "production" && new URL(value.AI_BASE_URL).protocol !== "https:") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["AI_BASE_URL"], message: "AI_BASE_URL must use HTTPS in production." });
  }
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
