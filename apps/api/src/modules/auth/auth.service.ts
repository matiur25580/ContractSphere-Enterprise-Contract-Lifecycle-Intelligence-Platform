import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../../config/env.js";
import { HttpError } from "../../common/http-error.js";
import { Tenant } from "../tenants/tenant.model.js";
import { User } from "../users/user.model.js";
import { RefreshSession } from "./refresh-session.model.js";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const createAccessToken = (user: { id: string; tenantId: string; role: "OWNER" | "ADMIN" | "MEMBER" }) =>
  jwt.sign({ tenantId: user.tenantId, role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: env.ACCESS_TOKEN_TTL as NonNullable<SignOptions["expiresIn"]>
  });

async function createRefreshSession(userId: string, tenantId: string) {
  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await RefreshSession.create({ userId, tenantId, tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt };
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
    return { accessToken: createAccessToken({ id: user.id, tenantId: tenant.id, role: user.role }), refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt, user: publicUser(user, tenant) };
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
  return { accessToken: createAccessToken({ id: user.id, tenantId: tenant.id, role: user.role }), refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt, user: publicUser(user, tenant) };
}

export async function rotateRefreshToken(token: string) {
  const session = await RefreshSession.findOneAndUpdate(
    { tokenHash: hashToken(token), revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date() } },
    { new: true }
  );
  if (!session) throw new HttpError(401, "Refresh session is invalid or expired. Please sign in again.", "INVALID_REFRESH_TOKEN");

  const [user, tenant] = await Promise.all([
    User.findOne({ _id: session.userId, tenantId: session.tenantId, status: "active" }),
    Tenant.findOne({ _id: session.tenantId, status: "active" })
  ]);
  if (!user || !tenant) throw new HttpError(401, "Account is no longer active.", "ACCOUNT_INACTIVE");
  const refresh = await createRefreshSession(user.id, tenant.id);
  return { accessToken: createAccessToken({ id: user.id, tenantId: tenant.id, role: user.role }), refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt, user: publicUser(user, tenant) };
}

export async function revokeRefreshToken(token?: string) {
  if (!token) return;
  await RefreshSession.updateOne({ tokenHash: hashToken(token), revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function getCurrentUser(userId: string, tenantId: string) {
  const [user, tenant] = await Promise.all([
    User.findOne({ _id: userId, tenantId, status: "active" }),
    Tenant.findOne({ _id: tenantId, status: "active" })
  ]);
  if (!user || !tenant) throw new HttpError(401, "Account is no longer active.", "ACCOUNT_INACTIVE");
  return publicUser(user, tenant);
}
