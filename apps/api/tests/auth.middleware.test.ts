import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { env } from "../src/config/env.js";
import { requireAuth, requireRoles } from "../src/modules/auth/auth.middleware.js";

const validClaims = {
  sub: "64b000000000000000000001",
  tenantId: "64b000000000000000000002",
  role: "MEMBER" as const
};

function requestWithAuthorization(value?: string) {
  return {
    header: vi.fn((name: string) => name.toLowerCase() === "authorization" ? value : undefined)
  } as unknown as Request;
}

function signedToken(claims: Record<string, unknown>) {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: "1m" });
}

describe("requireAuth middleware", () => {
  it("rejects requests without a bearer token", () => {
    const req = requestWithAuthorization();
    const next = vi.fn<NextFunction>();
    requireAuth(req, {} as Response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401, code: "UNAUTHENTICATED" });
  });

  it("rejects malformed and expired tokens", () => {
    for (const token of ["not-a-jwt", jwt.sign(validClaims, env.JWT_ACCESS_SECRET, { expiresIn: -1 })]) {
      const req = requestWithAuthorization(`Bearer ${token}`);
      const next = vi.fn<NextFunction>();
      requireAuth(req, {} as Response, next);
      expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401, code: "INVALID_TOKEN" });
    }
  });

  it("rejects signed tokens missing required tenant or subject claims", () => {
    for (const claims of [
      { sub: validClaims.sub, role: validClaims.role },
      { tenantId: validClaims.tenantId, role: validClaims.role }
    ]) {
      const req = requestWithAuthorization(`Bearer ${signedToken(claims)}`);
      const next = vi.fn<NextFunction>();
      requireAuth(req, {} as Response, next);
      expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401, code: "INVALID_TOKEN" });
    }
  });

  it("rejects signed tokens with an unsupported role", () => {
    const req = requestWithAuthorization(`Bearer ${signedToken({ ...validClaims, role: "SUPERUSER" })}`);
    const next = vi.fn<NextFunction>();
    requireAuth(req, {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401, code: "INVALID_TOKEN" });
  });

  it("attaches only verified identity and tenant claims", () => {
    const req = requestWithAuthorization(`Bearer ${signedToken(validClaims)}`);
    const next = vi.fn<NextFunction>();
    requireAuth(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({
      userId: validClaims.sub,
      tenantId: validClaims.tenantId,
      role: validClaims.role
    });
  });
});

describe("requireRoles middleware", () => {
  it("rejects unauthenticated requests", () => {
    const req = {} as Request;
    const next = vi.fn<NextFunction>();
    requireRoles("OWNER")(req, {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401, code: "UNAUTHENTICATED" });
  });

  it("rejects a valid user whose role is not allowed", () => {
    const req = { auth: { userId: validClaims.sub, tenantId: validClaims.tenantId, role: "MEMBER" } } as unknown as Request;
    const next = vi.fn<NextFunction>();
    requireRoles("OWNER", "ADMIN")(req, {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("allows an explicitly permitted role", () => {
    const req = { auth: { userId: validClaims.sub, tenantId: validClaims.tenantId, role: "ADMIN" } } as unknown as Request;
    const next = vi.fn<NextFunction>();
    requireRoles("OWNER", "ADMIN")(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});
