import { createHash, randomBytes } from "node:crypto";
import mongoose, { Types, type ClientSession } from "mongoose";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../../config/env.js";
import { HttpError } from "../../common/http-error.js";
import { Tenant } from "../tenants/tenant.model.js";
import { User } from "../users/user.model.js";
import { RefreshSession } from "./refresh-session.model.js";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const createAccessToken = (user: { id: string; tenantId: string; role: "OWNER" | "ADMIN" | "MEMBER" }, familyId: string) =>
  jwt.sign({ tenantId: user.tenantId, role: user.role, familyId }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: env.ACCESS_TOKEN_TTL as NonNullable<SignOptions["expiresIn"]>
  });

async function createRefreshSession(userId: string, tenantId: string, familyId = randomBytes(24).toString("hex"), session?: ClientSession) {
  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const document = { userId, tenantId, tokenHash: hashToken(token), familyId, expiresAt };
  if (session) await RefreshSession.create([document], { session });
  else await RefreshSession.create(document);
  return { token, expiresAt, familyId };
}

function publicUser(user: { _id: Types.ObjectId; name: string; email: string; role: string }, tenant: { _id: Types.ObjectId; name: string; slug: string }) {
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role, organization: { id: tenant._id.toString(), name: tenant.name, slug: tenant.slug } };
}

export async function register(input: { organizationName: string; organizationSlug: string; name: string; email: string; password: string }) {
  let tenant;
  try {
    tenant = await Tenant.create({ name: input.organizationName, slug: input.organizationSlug });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      throw new HttpError(409, "That organization URL is already taken.", "ORGANIZATION_SLUG_TAKEN");
    }
    throw error;
  }

  let createdUserId: string | undefined;
  try {
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await User.create({ tenantId: tenant._id, name: input.name, email: input.email, passwordHash, role: "OWNER" });
    createdUserId = user.id;
    const refresh = await createRefreshSession(user.id, tenant.id);
    return { accessToken: createAccessToken({ id: user.id, tenantId: tenant.id, role: user.role }, refresh.familyId), refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt, user: publicUser(user, tenant) };
  } catch (error) {
    if (createdUserId) await User.deleteOne({ _id: createdUserId });
    await Tenant.deleteOne({ _id: tenant._id });
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      throw new HttpError(409, "An account with this email already exists in the organization.", "ACCOUNT_ALREADY_EXISTS");
    }
    throw error;
  }
}

export async function login(input: { organizationSlug: string; email: string; password: string }) {
  const tenant = await Tenant.findOne({ slug: input.organizationSlug, status: "active" });
  if (!tenant) throw new HttpError(401, "Invalid organization, email, or password.", "INVALID_CREDENTIALS");
  const user = await User.findOne({ tenantId: tenant._id, email: input.email, status: "active" }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "Invalid organization, email, or password.", "INVALID_CREDENTIALS");
  }
  const refresh = await createRefreshSession(user.id, tenant.id);
  return { accessToken: createAccessToken({ id: user.id, tenantId: tenant.id, role: user.role }, refresh.familyId), refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt, user: publicUser(user, tenant) };
}

export async function rotateRefreshToken(token: string) {
  const sessionHash = hashToken(token);
  const dbSession = await mongoose.startSession();
  let result: { accessToken: string; refreshToken: string; refreshExpiresAt: Date; user: ReturnType<typeof publicUser> } | undefined;
  let failure: "INVALID_REFRESH_TOKEN" | "ACCOUNT_INACTIVE" | undefined;
  try {
    await dbSession.withTransaction(async () => {
      result = undefined;
      failure = undefined;
      const existing = await RefreshSession.findOne({ tokenHash: sessionHash }).session(dbSession);
      const now = new Date();
      if (!existing || existing.expiresAt <= now) {
        failure = "INVALID_REFRESH_TOKEN";
        return;
      }

      const familyId = existing.familyId ?? randomBytes(24).toString("hex");
      if (existing.revokedAt) {
        await RefreshSession.updateMany({ familyId }, { $set: { revokedAt: now } }, { session: dbSession });
        failure = "INVALID_REFRESH_TOKEN";
        return;
      }

      const consumed = await RefreshSession.findOneAndUpdate(
        { _id: existing._id, revokedAt: null, expiresAt: { $gt: now } },
        { $set: { revokedAt: now, familyId } },
        { new: true, session: dbSession }
      );
      if (!consumed) {
        await RefreshSession.updateMany({ familyId }, { $set: { revokedAt: now } }, { session: dbSession });
        failure = "INVALID_REFRESH_TOKEN";
        return;
      }

      const [user, tenant] = await Promise.all([
        User.findOne({ _id: consumed.userId, tenantId: consumed.tenantId, status: "active" }).session(dbSession),
        Tenant.findOne({ _id: consumed.tenantId, status: "active" }).session(dbSession)
      ]);
      if (!user || !tenant) {
        await RefreshSession.updateMany({ familyId }, { $set: { revokedAt: now } }, { session: dbSession });
        failure = "ACCOUNT_INACTIVE";
        return;
      }

      const refresh = await createRefreshSession(user.id, tenant.id, familyId, dbSession);
      result = {
        accessToken: createAccessToken({ id: user.id, tenantId: tenant.id, role: user.role }, refresh.familyId),
        refreshToken: refresh.token,
        refreshExpiresAt: refresh.expiresAt,
        user: publicUser(user, tenant)
      };
    });
    if (failure === "ACCOUNT_INACTIVE") throw new HttpError(401, "Account is no longer active.", "ACCOUNT_INACTIVE");
    if (failure || !result) throw new HttpError(401, "Refresh session is invalid or expired. Please sign in again.", "INVALID_REFRESH_TOKEN");
    return result;
  } finally {
    await dbSession.endSession();
  }
}

export async function revokeRefreshToken(token?: string) {
  if (!token) return;
  const session = await RefreshSession.findOne({ tokenHash: hashToken(token), revokedAt: null }).select("familyId").lean();
  if (!session) return;
  const revokedAt = new Date();
  if (session.familyId) {
    await RefreshSession.updateMany({ familyId: session.familyId, revokedAt: null }, { $set: { revokedAt } });
  } else {
    await RefreshSession.updateOne({ tokenHash: hashToken(token), revokedAt: null }, { $set: { revokedAt } });
  }
}

export async function getCurrentUser(userId: string, tenantId: string) {
  const [user, tenant] = await Promise.all([
    User.findOne({ _id: userId, tenantId, status: "active" }),
    Tenant.findOne({ _id: tenantId, status: "active" })
  ]);
  if (!user || !tenant) throw new HttpError(401, "Account is no longer active.", "ACCOUNT_INACTIVE");
  return publicUser(user, tenant);
}
