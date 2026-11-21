import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { HttpError } from "../../common/http-error.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { recordAuditEvent } from "../audit/audit.service.js";
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
const audit = (req: Request, action: string, resourceType: string, resourceId: string, summary: string) => recordAuditEvent({ tenantId: req.auth!.tenantId, actorId: req.auth!.userId, action, resourceType, resourceId, summary, ...(req.header("x-request-id") ? { requestId: req.header("x-request-id")! } : {}) });

obligationRouter.post("/", validateBody(createObligationSchema), asyncHandler(async (req, res) => {
  const obligation = await createObligation(req.auth!.tenantId, req.auth!.userId, req.auth!.role, req.body);
  await audit(req, "OBLIGATION_CREATED", "OBLIGATION", obligation.id, "Created contract obligation");
  res.status(201).json({ success: true, data: { obligation } });
}));
obligationRouter.get("/", validateQuery(listObligationsSchema), asyncHandler(async (req, res) => {
  const result = await listObligations(req.auth!.tenantId, res.locals.validatedQuery);
  res.json({ success: true, data: result });
}));
obligationRouter.patch("/:obligationId", validateBody(updateObligationSchema), asyncHandler(async (req, res) => {
  const obligation = await updateObligation(req.auth!.tenantId, req.auth!.userId, req.auth!.role, idParam(req, "obligationId"), req.body);
  if (!obligation) throw new HttpError(404, "Obligation not found.", "OBLIGATION_NOT_FOUND");\n  await audit(req, "OBLIGATION_UPDATED", "OBLIGATION", obligation.id, "Updated obligation status or details");
  res.json({ success: true, data: { obligation } });
}));
obligationRouter.get("/renewals", validateQuery(renewalQuerySchema), asyncHandler(async (req, res) => {
  const result = await listRenewals(req.auth!.tenantId, res.locals.validatedQuery);
  res.json({ success: true, data: result });
}));
obligationRouter.put("/renewals/:contractId", validateBody(upsertRenewalSchema), asyncHandler(async (req, res) => {
  const renewal = await upsertRenewal(req.auth!.tenantId, req.auth!.userId, req.auth!.role, idParam(req, "contractId"), req.body);
  await audit(req, "RENEWAL_SCHEDULED", "RENEWAL", renewal.id, "Created or updated a renewal schedule");
  res.status(200).json({ success: true, data: { renewal } });
}));
obligationRouter.patch("/renewals/:renewalId/status", validateBody(updateRenewalStatusSchema), asyncHandler(async (req, res) => {
  const renewal = await changeRenewalStatus(req.auth!.tenantId, req.auth!.userId, req.auth!.role, idParam(req, "renewalId"), req.body.status);
  await audit(req, "RENEWAL_STATUS_CHANGED", "RENEWAL", renewal.id, `Changed renewal status to ${req.body.status}`);
  res.json({ success: true, data: { renewal } });
}));
