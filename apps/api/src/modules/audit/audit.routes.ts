import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { HttpError } from "../../common/http-error.js";
import { requireAuth, requireRoles } from "../auth/auth.middleware.js";
import { listAuditEvents } from "./audit.service.js";

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRoles("OWNER", "ADMIN"));
const querySchema = z.object({
  resourceType: z.string().trim().min(1).max(60).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  resourceId: z.string().trim().min(1).max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});
auditRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Invalid audit query.", "VALIDATION_ERROR");
  const result = await listAuditEvents(req.auth!.tenantId, parsed.data);
  res.json({ success: true, data: result });
}));
