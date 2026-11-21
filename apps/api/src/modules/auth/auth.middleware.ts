import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { HttpError } from "../../common/http-error.js";
import { User, type UserRole } from "../users/user.model.js";
import { Tenant } from "../tenants/tenant.model.js";
import { RefreshSession } from "./refresh-session.model.js";

interface AccessClaims { sub: string; tenantId: string; role: UserRole; familyId?: string; }
const supportedRoles: UserRole[] = ["OWNER", "ADMIN", "MEMBER"];

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return next(new HttpError(401, "Authentication required.", "UNAUTHENTICATED"));

  let claims: AccessClaims;
  try {
    claims = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as AccessClaims;
  } catch {
    return next(new HttpError(401, "Access token is invalid or expired.", "INVALID_TOKEN"));
  }
  if (!claims.sub || !claims.tenantId || !supportedRoles.includes(claims.role)) {
    return next(new HttpError(401, "Invalid access token.", "INVALID_TOKEN"));
  }

  try {
    const [user, tenant, sessionActive] = await Promise.all([
      User.findOne({ _id: claims.sub, tenantId: claims.tenantId, status: "active" }).select("role").lean(),
      Tenant.exists({ _id: claims.tenantId, status: "active" }),
      claims.familyId
        ? RefreshSession.exists({ familyId: claims.familyId, revokedAt: null, expiresAt: { $gt: new Date() } })
        : Promise.resolve(true)
    ]);
    if (!user || !tenant) return next(new HttpError(401, "Account is inactive or no longer available.", "ACCOUNT_INACTIVE"));
    if (!sessionActive) return next(new HttpError(401, "This sign-in session has been revoked. Please sign in again.", "SESSION_REVOKED"));
    if (!supportedRoles.includes(user.role)) return next(new HttpError(401, "Account role is invalid.", "INVALID_ACCOUNT_ROLE"));
    req.auth = { userId: claims.sub, tenantId: claims.tenantId, role: user.role };
    next();
  } catch (error) {
    next(error);
  }
};

export const requireRoles = (...roles: UserRole[]): RequestHandler => (req, _res, next) => {
  if (!req.auth) return next(new HttpError(401, "Authentication required.", "UNAUTHENTICATED"));
  if (!roles.includes(req.auth.role)) return next(new HttpError(403, "You do not have permission to perform this action.", "FORBIDDEN"));
  next();
};
