import mongoose, { Types } from "mongoose";
import jwt from "jsonwebtoken";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { env } from "../src/config/env.js";
import { Tenant } from "../src/modules/tenants/tenant.model.js";
import { User } from "../src/modules/users/user.model.js";
import { requireAuth } from "../src/modules/auth/auth.middleware.js";

const uri = process.env.MONGODB_URI?.replace(/\/[^/?]+(\?.*)?$/, "/contractsphere_auth_middleware$1");
const newId = () => new Types.ObjectId();

describe.skipIf(!uri)("requireAuth account revocation — MongoDB integration", () => {
  let tenantId: Types.ObjectId;
  let userId: Types.ObjectId;

  beforeAll(async () => {
    await mongoose.connect(uri!);
    await Promise.all([Tenant.syncIndexes(), User.syncIndexes()]);
  });

  beforeEach(async () => {
    const tenant = await Tenant.create({ _id: newId(), name: "Middleware tenant", slug: "middleware-" + newId().toString(), status: "active" });
    tenantId = tenant._id;
    const user = await User.create({
      _id: newId(), tenantId, name: "Middleware user", email: "middleware-user@example.test",
      passwordHash: "test-only-hash", role: "ADMIN", status: "active"
    });
    userId = user._id;
  });

  afterEach(async () => {
    await Promise.all([User.deleteMany({}), Tenant.deleteMany({})]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  function request() {
    const token = jwt.sign({ sub: userId.toString(), tenantId: tenantId.toString(), role: "MEMBER" }, env.JWT_ACCESS_SECRET, { expiresIn: "5m" });
    return { header: vi.fn((name: string) => name.toLowerCase() === "authorization" ? `Bearer ${token}` : undefined) } as unknown as Request;
  }

  it("uses the current database role rather than a stale access-token role", async () => {
    const req = request();
    const next = vi.fn<NextFunction>();
    await requireAuth(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({ userId: userId.toString(), tenantId: tenantId.toString(), role: "ADMIN" });
  });

  it("rejects an already-issued access token immediately after user deactivation", async () => {
    await User.updateOne({ _id: userId, tenantId }, { $set: { status: "disabled" } });
    const req = request();
    const next = vi.fn<NextFunction>();
    await requireAuth(req, {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401, code: "ACCOUNT_INACTIVE" });
  });

  it("rejects an already-issued access token immediately after tenant suspension", async () => {
    await Tenant.updateOne({ _id: tenantId }, { $set: { status: "suspended" } });
    const req = request();
    const next = vi.fn<NextFunction>();
    await requireAuth(req, {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401, code: "ACCOUNT_INACTIVE" });
  });
});
