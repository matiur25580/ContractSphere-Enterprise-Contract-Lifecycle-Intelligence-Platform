import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "../src/modules/auth/auth.validation.js";

describe("registration validation", () => {
  const valid = {
    organizationName: "Acme Legal",
    organizationSlug: "acme-legal",
    name: "Avery Admin",
    email: "AVERY@EXAMPLE.COM",
    password: "StrongPassword123"
  };

  it("normalizes email addresses", () => {
    expect(registerSchema.parse(valid).email).toBe("avery@example.com");
  });

  it("rejects weak passwords", () => {
    expect(registerSchema.safeParse({ ...valid, password: "weakpassword" }).success).toBe(false);
  });

  it("rejects invalid organization slugs", () => {
    expect(registerSchema.safeParse({ ...valid, organizationSlug: "Acme Legal!" }).success).toBe(false);
  });
});

describe("login validation", () => {
  it("requires an organization slug and valid email", () => {
    expect(loginSchema.safeParse({ organizationSlug: "acme", email: "not-an-email", password: "secret" }).success).toBe(false);
  });
});
