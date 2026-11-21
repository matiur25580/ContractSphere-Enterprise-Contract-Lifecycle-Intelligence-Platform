import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { HttpError } from "../../common/http-error.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { createObligation, listObligations, updateObligation, listRenewals, upsertRenewal, changeRenewalStatus } from "./obligation.service.js";
import { createObligationSchema, updateObligationSchema, listObligationsSchema, upsertRenewalSchema, updateRenewalStatusSchema } from "./obligation.validation.js";

export const obligationRouter = Router();
obligationRouter.use(requireAuth);
const validateBody = (schema: z.ZodTypeAny): RequestHandler => (req, _res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return next(new HttpError(400, "Request validation failed.", "VALIDATION_ERROR"));
  req.body = parsed.data; next();
};
const validateQuery = (schema: z.ZodTypeAny): RequestHandler => (req, res, next) => {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return next(new HttpError(400, "Request validation failed.", "VALIDATION_ERROR"));
  res.locals.validatedQuery = parsed.data; next();
};
const idParam = (req: Request, key: string) => {
  const value = req.params[key];
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) throw new HttpError(400, "Invalid resource identifier.", "INVALID_ID");
  return value;
};
const renewalQuerySchema = z.object({ status: z.enum(["UPCOMING", "NOTICE_DUE", "RENEWAL_IN_PROGRESS", "RENEWED", "TERMINATED", "EXPIRED"]).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });

obligationRouter.post("/", validateBody(createObligationSchema), asyncHandler(async (req, res) => {
  const obligation = await createObligation(req.auth!.tenantId, req.auth!.userId, req.auth!.role, req.body);
  res.status(201).json({ success: true, data: { obligation } });
}));
obligationRouter.get("/", validateQuery(listObligationsSchema), asyncHandler(async (req, res) => {
  const result = await listObligations(req.auth!.tenantId, res.locals.validatedQuery);
  res.json({ success: true, data: result });
}));
obligationRouter.patch("/:obligationId", validateBody(updateObligationSchema), asyncHandler(async (req, res) => {
  const obligation = await updateObligation(req.auth!.tenantId, req.auth!.userId, req.auth!.role, idParam(req, "obligationId"), req.body);
  res.json({ success: true, data: { obligation } });
}));
obligationRouter.get("/renewals", validateQuery(renewalQuerySchema), asyncHandler(async (req, res) => {
  const result = await listRenewals(req.auth!.tenantId, res.locals.validatedQuery);
  res.json({ success: true, data: result });
}));
obligationRouter.put("/renewals/:contractId", validateBody(upsertRenewalSchema), asyncHandler(async (req, res) => {
  const renewal = await upsertRenewal(req.auth!.tenantId, req.auth!.userId, req.auth!.role, idParam(req, "contractId"), req.body);
  res.status(200).json({ success: true, data: { renewal } });
}));
obligationRouter.patch("/renewals/:renewalId/status", validateBody(updateRenewalStatusSchema), asyncHandler(async (req, res) => {
  const renewal = await changeRenewalStatus(req.auth!.tenantId, req.auth!.userId, req.auth!.role, idParam(req, "renewalId"), req.body.status);
  res.json({ success: true, data: { renewal } });
}));
