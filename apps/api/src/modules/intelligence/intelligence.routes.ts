import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { HttpError } from "../../common/http-error.js";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import { analyzeContract, analyzeStoredDocument, listContractAnalyses } from "./intelligence.service.js";
import { compareContractSources, listContractComparisons } from "./comparison.service.js";
export const intelligenceRouter = Router();
intelligenceRouter.use(requireAuth);
const engineSchema = z.enum(["RULE_BASED", "AI_COMPATIBLE"]).default("RULE_BASED");
const analysisSchema = z.object({
 sourceText: z.string().trim().min(100).max(30000),
 sourceLabel: z.string().trim().min(1).max(120).default("Pasted contract text"),
 engine: engineSchema
}).strict();
const documentSchema = z.object({ engine: engineSchema }).strict();
const pastedComparisonSchema = z.object({
 baselineText: z.string().trim().min(100).max(30000),
 candidateText: z.string().trim().min(100).max(30000),
 baselineLabel: z.string().trim().min(1).max(120).default("Baseline text"),
 candidateLabel: z.string().trim().min(1).max(120).default("Candidate text")
}).strict();
const versionComparisonSchema = z.object({
 baselineFileId: z.string().regex(/^[a-f\d]{24}$/i),
 candidateFileId: z.string().regex(/^[a-f\d]{24}$/i)
}).strict();
const validate = (schema: z.ZodTypeAny): RequestHandler => (req, _res, next) => {
 const parsed = schema.safeParse(req.body);
 if (!parsed.success) return next(new HttpError(400, "The request is invalid.", "VALIDATION_ERROR"));
 req.body = parsed.data; next();
};
const idParam = (req: Parameters<RequestHandler>[0], key: string) => {
 const id = req.params[key];
 if (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, "Invalid resource identifier.", "INVALID_ID");
 return id;
};
const audit = (req: Parameters<RequestHandler>[0], report: { engine: string; findings: unknown[] }, contractId: string, source: string) =>
 recordAuditEvent({ tenantId: req.auth!.tenantId, actorId: req.auth!.userId, action: "CONTRACT_INTELLIGENCE_ANALYZED", resourceType: "CONTRACT", resourceId: contractId, summary: "Created contract intelligence report", metadata: { engine: report.engine, findingCount: report.findings.length, source } });
intelligenceRouter.post("/:contractId/intelligence/analyze", validate(analysisSchema), asyncHandler(async (req, res) => {
 const contractId = idParam(req, "contractId");
 const report = await analyzeContract(req.auth!.tenantId, req.auth!.userId, req.auth!.role, contractId, req.body.sourceText, req.body.sourceLabel, req.body.engine);
 await audit(req, report, contractId, "PASTED_TEXT");
 res.status(201).json({ success: true, data: { report } });
}));
intelligenceRouter.post("/:contractId/intelligence/documents/:fileId/analyze", validate(documentSchema), asyncHandler(async (req, res) => {
 const contractId = idParam(req, "contractId");
 const report = await analyzeStoredDocument(req.auth!.tenantId, req.auth!.userId, req.auth!.role, contractId, idParam(req, "fileId"), req.body.engine);
 await audit(req, report, contractId, "STORED_DOCUMENT");
 res.status(201).json({ success: true, data: { report } });
}));
intelligenceRouter.post("/:contractId/intelligence/compare", validate(z.union([pastedComparisonSchema, versionComparisonSchema])), asyncHandler(async (req, res) => {
 const contractId = idParam(req, "contractId");
 const comparison = await compareContractSources({
  tenantId: req.auth!.tenantId, userId: req.auth!.userId, role: req.auth!.role, contractId, ...req.body
 });
 await recordAuditEvent({ tenantId: req.auth!.tenantId, actorId: req.auth!.userId, action: "CONTRACT_VERSIONS_COMPARED", resourceType: "CONTRACT", resourceId: contractId, summary: "Compared two contract versions", metadata: { similarityScore: comparison.similarityScore, addedClauses: comparison.clauseChanges.filter(item => item.change === "ADDED").length, removedClauses: comparison.clauseChanges.filter(item => item.change === "REMOVED").length } });
 res.status(201).json({ success: true, data: { comparison } });
}));
intelligenceRouter.get("/:contractId/intelligence/comparisons", asyncHandler(async (req, res) => {
 const comparisons = await listContractComparisons(req.auth!.tenantId, req.auth!.userId, req.auth!.role, idParam(req, "contractId"));
 res.json({ success: true, data: { comparisons } });
}));
intelligenceRouter.get("/:contractId/intelligence", asyncHandler(async (req, res) => {
 const reports = await listContractAnalyses(req.auth!.tenantId, req.auth!.userId, req.auth!.role, idParam(req, "contractId"));
 res.json({ success: true, data: { reports } });
}));
