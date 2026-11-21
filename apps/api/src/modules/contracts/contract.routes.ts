import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { HttpError } from "../../common/http-error.js";
import { requireAuth } from "../auth/auth.middleware.js";
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

contractRouter.post("/", validate(createContractSchema), asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const contract = await createContract(auth.tenantId, auth.userId, req.body);
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
  const contract = await updateContract(req.auth!.tenantId, req.auth!.userId, idParam(req, "contractId"), req.body);
  res.json({ success: true, data: { contract } });
}));

contractRouter.post("/:contractId/uploads", validate(uploadIntentSchema), asyncHandler(async (req, res) => {
  const upload = await createDocumentUpload(req.auth!.tenantId, req.auth!.userId, idParam(req, "contractId"), req.body);
  res.status(201).json({ success: true, data: { upload } });
}));

contractRouter.post("/uploads/:uploadId/complete", asyncHandler(async (req, res) => {
  const file = await completeDocumentUpload(req.auth!.tenantId, req.auth!.userId, idParam(req, "uploadId"));
  res.status(201).json({ success: true, data: { file } });
}));

contractRouter.get("/:contractId/versions/:fileId/download", asyncHandler(async (req, res) => {
  const result = await getDocumentDownloadUrl(req.auth!.tenantId, idParam(req, "contractId"), idParam(req, "fileId"));
  res.json({ success: true, data: result });
}));
