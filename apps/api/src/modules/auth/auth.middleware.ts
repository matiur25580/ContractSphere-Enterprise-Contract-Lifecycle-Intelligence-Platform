import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { HttpError } from "../../common/http-error.js";
import type { UserRole } from "../users/user.model.js";

interface AccessClaims { sub: string; tenantId: string; role: UserRole; }
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return next(new HttpError(401, "Authentication required.", "UNAUTHENTICATED"));
  try {
    const claims = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as AccessClaims;
    if (!claims.sub || !claims.tenantId || !["OWNER", "ADMIN", "MEMBER"].includes(claims.role)) {
      return next(new HttpError(401, "Invalid access token.", "INVALID_TOKEN"));
    }
    req.auth = { userId: claims.sub, tenantId: claims.tenantId, role: claims.role };
    next();
  } catch {
    next(new HttpError(401, "Access token is invalid or expired.", "INVALID_TOKEN"));
  }
};

export const requireRoles = (...roles: UserRole[]): RequestHandler => (req, _res, next) => {
  if (!req.auth) return next(new HttpError(401, "Authentication required.", "UNAUTHENTICATED"));
  if (!roles.includes(req.auth.role)) return next(new HttpError(403, "You do not have permission to perform this action.", "FORBIDDEN"));
  next();
};
