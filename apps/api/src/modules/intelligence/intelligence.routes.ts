import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { HttpError } from "../../common/http-error.js";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import { analyzeContract, listContractAnalyses } from "./intelligence.service.js";
export const intelligenceRouter = Router();
intelligenceRouter.use(requireAuth);
const analysisSchema = z.object({
 sourceText: z.string().trim().min(100).max(30000),
 sourceLabel: z.string().trim().min(1).max(120).default("Pasted contract text")
}).strict();
const validate: RequestHandler = (req, _res, next) => {
 const parsed = analysisSchema.safeParse(req.body);
 if (!parsed.success) return next(new HttpError(400, "Provide contract text between 100 and 30,000 characters.", "VALIDATION_ERROR"));
 req.body = parsed.data; next();
};
const idParam = (req: Parameters<RequestHandler>[0]) => {
 const id = req.params.contractId;
 if (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, "Invalid contract identifier.", "INVALID_ID");
 return id;
};
intelligenceRouter.post("/:contractId/intelligence/analyze", validate, asyncHandler(async (req, res) => {
 const report = await analyzeContract(req.auth!.tenantId, req.auth!.userId, req.auth!.role, idParam(req), req.body.sourceText, req.body.sourceLabel);
 await recordAuditEvent({ tenantId: req.auth!.tenantId, actorId: req.auth!.userId, action: "CONTRACT_INTELLIGENCE_ANALYZED", resourceType: "CONTRACT", resourceId: idParam(req), summary: "Created evidence-grounded contract intelligence report", metadata: { engine: report.engine, findingCount: report.findings.length } });
 res.status(201).json({ success: true, data: { report } });
}));
intelligenceRouter.get("/:contractId/intelligence", asyncHandler(async (req, res) => {
 const reports = await listContractAnalyses(req.auth!.tenantId, req.auth!.userId, req.auth!.role, idParam(req));
 res.json({ success: true, data: { reports } });
}));
