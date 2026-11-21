import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { HttpError } from "../../common/http-error.js";
import { requireAuth, requireRoles } from "../auth/auth.middleware.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import { approveTemplate, createClause, createTemplate, createTemplateRevision, generateContractFromTemplate, getTemplate, listClauses, listTemplates, submitTemplate, updateClause, updateTemplate } from "./template.service.js";
import { createClauseSchema, generateTemplateSchema, templateDefinitionSchema, updateClauseSchema } from "./template.validation.js";
export const templateRouter = Router();
templateRouter.use(requireAuth);
const validate = (schema: z.ZodTypeAny): RequestHandler => (req, _res, next) => {
 const parsed = schema.safeParse(req.body);
 if (!parsed.success) return next(new HttpError(400, "Request validation failed.", "VALIDATION_ERROR"));
 req.body = parsed.data; next();
};
const idParam = (req: Parameters<RequestHandler>[0], key: string) => {
 const id = req.params[key];
 if (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, "Invalid resource identifier.", "INVALID_ID");
 return id;
};
const audit = (req: Parameters<RequestHandler>[0], action: string, id: string, summary: string) =>
 recordAuditEvent({ tenantId: req.auth!.tenantId, actorId: req.auth!.userId, action, resourceType: "CONTRACT_TEMPLATE", resourceId: id, summary });
templateRouter.get("/", asyncHandler(async (req, res) => res.json({ success: true, data: { templates: await listTemplates(req.auth!.tenantId) } })));
templateRouter.get("/clauses", asyncHandler(async (req, res) => res.json({ success: true, data: { clauses: await listClauses(req.auth!.tenantId) } })));
templateRouter.post("/clauses", requireRoles("OWNER", "ADMIN"), validate(createClauseSchema), asyncHandler(async (req, res) => {
 const clause = await createClause(req.auth!.tenantId, req.auth!.userId, req.body);
 await audit(req, "CLAUSE_CREATED", clause.id, `Created clause: ${clause.title}`);
 res.status(201).json({ success: true, data: { clause } });
}));
templateRouter.patch("/clauses/:clauseId", requireRoles("OWNER", "ADMIN"), validate(updateClauseSchema), asyncHandler(async (req, res) => {
 const clause = await updateClause(req.auth!.tenantId, req.auth!.userId, idParam(req, "clauseId"), req.body);
 await audit(req, "CLAUSE_VERSION_CREATED", clause.id, `Updated clause to version ${clause.version}: ${clause.title}`);
 res.json({ success: true, data: { clause } });
}));
templateRouter.post("/", requireRoles("OWNER", "ADMIN"), validate(templateDefinitionSchema), asyncHandler(async (req, res) => {
 const template = await createTemplate(req.auth!.tenantId, req.auth!.userId, req.body);
 await audit(req, "TEMPLATE_CREATED", template.id, `Created template: ${template.name}`);
 res.status(201).json({ success: true, data: { template } });
}));
templateRouter.get("/:templateId", asyncHandler(async (req, res) => res.json({ success: true, data: { template: await getTemplate(req.auth!.tenantId, idParam(req, "templateId")) } })));
templateRouter.patch("/:templateId", requireRoles("OWNER", "ADMIN"), validate(templateDefinitionSchema), asyncHandler(async (req, res) => {
 const template = await updateTemplate(req.auth!.tenantId, req.auth!.userId, idParam(req, "templateId"), req.body);
 await audit(req, "TEMPLATE_UPDATED", template.id, `Updated draft template: ${template.name}`);
 res.json({ success: true, data: { template } });
}));
templateRouter.post("/:templateId/submit", requireRoles("OWNER", "ADMIN"), asyncHandler(async (req, res) => {
 const template = await submitTemplate(req.auth!.tenantId, idParam(req, "templateId"));
 await audit(req, "TEMPLATE_SUBMITTED", template.id, `Submitted template for approval: ${template.name}`);
 res.json({ success: true, data: { template } });
}));
templateRouter.post("/:templateId/approve", requireRoles("OWNER", "ADMIN"), asyncHandler(async (req, res) => {
 const template = await approveTemplate(req.auth!.tenantId, req.auth!.userId, idParam(req, "templateId"));
 await audit(req, "TEMPLATE_APPROVED", template.id, `Approved template: ${template.name}`);
 res.json({ success: true, data: { template } });
}));
templateRouter.post("/:templateId/revisions", requireRoles("OWNER", "ADMIN"), asyncHandler(async (req, res) => {
 const template = await createTemplateRevision(req.auth!.tenantId, req.auth!.userId, idParam(req, "templateId"));
 await audit(req, "TEMPLATE_REVISION_CREATED", template.id, `Created revision ${template.version} of ${template.name}`);
 res.status(201).json({ success: true, data: { template } });
}));
templateRouter.post("/:templateId/generate", validate(generateTemplateSchema), asyncHandler(async (req, res) => {
 const result = await generateContractFromTemplate(req.auth!.tenantId, req.auth!.userId, idParam(req, "templateId"), req.body);
 await audit(req, "CONTRACT_GENERATED_FROM_TEMPLATE", result.contract.id, `Generated draft from template version ${result.templateVersion}`);
 res.status(201).json({ success: true, data: result });
}));
