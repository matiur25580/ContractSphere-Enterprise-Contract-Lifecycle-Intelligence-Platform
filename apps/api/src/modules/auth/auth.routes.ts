import { Router, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { HttpError } from "../../common/http-error.js";
import { env } from "../../config/env.js";
import { requireAuth } from "./auth.middleware.js";
import { login, register, rotateRefreshToken, revokeRefreshToken, getCurrentUser } from "./auth.service.js";
import { loginSchema, registerSchema } from "./auth.validation.js";

export const authRouter = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, error: { code: "TOO_MANY_ATTEMPTS", message: "Too many authentication attempts. Try again later." } } });
const cookieName = "contractsphere_refresh";
const cookieOptions = () => ({ httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax" as const, path: `${env.API_PREFIX}/auth` });
const setRefreshCookie = (res: Parameters<RequestHandler>[1], token: string, expiresAt: Date) => {
  res.cookie(cookieName, token, { ...cookieOptions(), expires: expiresAt });
};
const clearRefreshCookie = (res: Parameters<RequestHandler>[1]) => res.clearCookie(cookieName, cookieOptions());
const parseBody = <T>(schema: z.ZodType<T>): RequestHandler => (req, _res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return next(new HttpError(400, "Request validation failed.", "VALIDATION_ERROR"));
  req.body = parsed.data;
  next();
};
const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
  if (req.get("origin") !== env.WEB_ORIGIN) return next(new HttpError(403, "Request origin is not allowed.", "UNTRUSTED_ORIGIN"));
  next();
};

authRouter.post("/register", authLimiter, parseBody(registerSchema), asyncHandler(async (req, res) => {
  const result = await register(req.body);
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  res.status(201).json({ success: true, data: { accessToken: result.accessToken, user: result.user } });
}));

authRouter.post("/login", authLimiter, parseBody(loginSchema), asyncHandler(async (req, res) => {
  const result = await login(req.body);
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  res.json({ success: true, data: { accessToken: result.accessToken, user: result.user } });
}));

authRouter.post("/refresh", requireTrustedOrigin, asyncHandler(async (req, res) => {
  const token = req.cookies?.[cookieName] as string | undefined;
  if (!token) throw new HttpError(401, "Refresh session is missing.", "MISSING_REFRESH_TOKEN");
  const result = await rotateRefreshToken(token);
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  res.json({ success: true, data: { accessToken: result.accessToken, user: result.user } });
}));

authRouter.post("/logout", requireTrustedOrigin, asyncHandler(async (req, res) => {
  await revokeRefreshToken(req.cookies?.[cookieName] as string | undefined);
  clearRefreshCookie(res);
  res.json({ success: true, data: { message: "Signed out successfully." } });
}));

authRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const user = await getCurrentUser(auth.userId, auth.tenantId);
  res.json({ success: true, data: { user } });
}));
