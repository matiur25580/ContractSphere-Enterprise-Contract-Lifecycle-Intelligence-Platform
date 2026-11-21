import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { register, rotateRefreshToken } from "../src/modules/auth/auth.service.js";
import { RefreshSession } from "../src/modules/auth/refresh-session.model.js";
import { Tenant } from "../src/modules/tenants/tenant.model.js";
import { User } from "../src/modules/users/user.model.js";

const uri = process.env.MONGODB_URI?.replace(/\/[^/?]+(\?.*)?$/, "/contractsphere_auth$1");

describe.skipIf(!uri)("refresh-token family replay protection — MongoDB integration", () => {
  beforeAll(async () => {
    await mongoose.connect(uri!);
    await Promise.all([Tenant.syncIndexes(), User.syncIndexes(), RefreshSession.syncIndexes()]);
  });

  afterEach(async () => {
    await Promise.all([
      RefreshSession.deleteMany({}),
      User.deleteMany({}),
      Tenant.deleteMany({})
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  async function createSession() {
    return register({
      organizationName: "Refresh Family Test",
      organizationSlug: "refresh-family-test",
      name: "Refresh Owner",
      email: "refresh-owner@example.test",
      password: "Long-Test-Password-123"
    });
  }

  it("revokes the entire family when a consumed refresh token is replayed", async () => {
    const initial = await createSession();
    const rotated = await rotateRefreshToken(initial.refreshToken);
    const sessions = await RefreshSession.find({ userId: initial.user.id }).lean();
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.familyId).toBeTruthy();
    expect(sessions[0]?.familyId).toBe(sessions[1]?.familyId);

    await expect(rotateRefreshToken(initial.refreshToken))
      .rejects.toMatchObject({ statusCode: 401, code: "INVALID_REFRESH_TOKEN" });

    const family = await RefreshSession.find({ familyId: sessions[0]!.familyId }).lean();
    expect(family).toHaveLength(2);
    expect(family.every(session => session.revokedAt instanceof Date)).toBe(true);
    await expect(rotateRefreshToken(rotated.refreshToken))
      .rejects.toMatchObject({ statusCode: 401, code: "INVALID_REFRESH_TOKEN" });
  });

  it("invalidates the winning successor when two refresh requests race on one token", async () => {
    const initial = await createSession();
    const attempts = await Promise.allSettled([
      rotateRefreshToken(initial.refreshToken),
      rotateRefreshToken(initial.refreshToken)
    ]);
    const winners = attempts.filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof rotateRefreshToken>>> => item.status === "fulfilled");
    expect(winners).toHaveLength(1);
    await expect(rotateRefreshToken(winners[0]!.value.refreshToken))
      .rejects.toMatchObject({ statusCode: 401, code: "INVALID_REFRESH_TOKEN" });
    const family = await RefreshSession.find({ userId: initial.user.id }).lean();
    expect(family.length).toBeGreaterThanOrEqual(2);
    expect(family.every(session => session.revokedAt instanceof Date)).toBe(true);
  });
});
