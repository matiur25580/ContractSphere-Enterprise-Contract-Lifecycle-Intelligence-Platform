import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { HttpError } from "../../common/http-error.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import { createContract, createDocumentUpload, completeDocumentUpload, getContract, getDocumentDownloadUrl, listContracts, updateContract } from "./contract.service.js";
import { createContractSchema, listContractsSchema, updateContractSchema, uploadIntentSchema } from "./contract.validation.js";

export const contractRouter = Router();
contractRouter.use(requireAuth);
const validate = (schema: z.ZodTypeAny, source: "body" | "query" = "body"): RequestHandler => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) return next(new HttpError(400, "Request validation failed.", "VALIDATION_ERROR"));
  if (source === "body") req.body = result.data;
  else res.locals.validatedQuery = result.data;
  next();
};
const idParam = (req: Parameters<RequestHandler>[0], key: string) => {
  const value = req.params[key];
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) throw new HttpError(400, "Invalid resource identifier.", "INVALID_ID");
  return value;
};
const audit = (req: Parameters<RequestHandler>[0], action: string, resourceId: string, summary: string, metadata?: Record<string, string | number | boolean | null>) =>
  recordAuditEvent({ tenantId: req.auth!.tenantId, actorId: req.auth!.userId, action, resourceType: "CONTRACT", resourceId, summary, ...(metadata ? { metadata } : {}), ...(req.header("x-request-id") ? { requestId: req.header("x-request-id")! } : {}) });

contractRouter.post("/", validate(createContractSchema), asyncHandler(async (req, res) => {
  const contract = await createContract(req.auth!.tenantId, req.auth!.userId, req.body);
  await audit(req, "CONTRACT_CREATED", contract.id, `Created contract ${contract.contractNumber}`, { status: contract.status });
  res.status(201).json({ success: true, data: { contract } });
}));
contractRouter.get("/", validate(listContractsSchema, "query"), asyncHandler(async (req, res) => {
  const result = await listContracts(req.auth!.tenantId, res.locals.validatedQuery);
  res.json({ success: true, data: result });
}));
contractRouter.get("/:contractId", asyncHandler(async (req, res) => {
  const contract = await getContract(req.auth!.tenantId, idParam(req, "contractId"));
  res.json({ success: true, data: { contract } });
}));
contractRouter.patch("/:contractId", validate(updateContractSchema), asyncHandler(async (req, res) => {
  if (req.body.status && req.auth!.role === "MEMBER") throw new HttpError(403, "Only organization owners and administrators can change contract status.", "FORBIDDEN");
  if (req.body.status && !["EXECUTED", "EXPIRED", "TERMINATED", "ARCHIVED"].includes(req.body.status)) throw new HttpError(403, "Draft, review, and approval states are controlled by the approval workflow.", "WORKFLOW_STATE_REQUIRED");
  const contract = await updateContract(req.auth!.tenantId, req.auth!.userId, idParam(req, "contractId"), req.body);
  await audit(req, "CONTRACT_UPDATED", contract.id, `Updated contract ${contract.contractNumber}`, { status: contract.status });
  res.json({ success: true, data: { contract } });
}));
contractRouter.post("/:contractId/uploads", validate(uploadIntentSchema), asyncHandler(async (req, res) => {
  const upload = await createDocumentUpload(req.auth!.tenantId, req.auth!.userId, idParam(req, "contractId"), req.body);
  await audit(req, "DOCUMENT_UPLOAD_REQUESTED", idParam(req, "contractId"), "Requested a contract document upload");
  res.status(201).json({ success: true, data: { upload } });
}));
contractRouter.post("/uploads/:uploadId/complete", asyncHandler(async (req, res) => {
  const file = await completeDocumentUpload(req.auth!.tenantId, req.auth!.userId, idParam(req, "uploadId"));
  await audit(req, "DOCUMENT_VERSION_ADDED", file.contractId.toString(), `Added document version ${file.version}`, { version: file.version, sizeBytes: file.sizeBytes });
  res.status(201).json({ success: true, data: { file } });
}));
contractRouter.get("/:contractId/versions/:fileId/download", asyncHandler(async (req, res) => {
  const result = await getDocumentDownloadUrl(req.auth!.tenantId, idParam(req, "contractId"), idParam(req, "fileId"));
  res.json({ success: true, data: result });
}));
