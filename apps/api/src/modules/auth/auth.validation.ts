import { z } from "zod";

export const registerSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  organizationSlug: z.string().trim().toLowerCase().min(3).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  password: z.string().min(12).max(128).regex(/[a-z]/, "Password must contain a lowercase letter.").regex(/[A-Z]/, "Password must contain an uppercase letter.").regex(/[0-9]/, "Password must contain a number.")
});
export const loginSchema = z.object({
  organizationSlug: z.string().trim().toLowerCase().min(3).max(48),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  password: z.string().min(1).max(128)
});
