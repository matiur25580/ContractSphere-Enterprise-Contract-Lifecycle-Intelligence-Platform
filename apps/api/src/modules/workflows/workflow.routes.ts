import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { HttpError } from "../../common/http-error.js";
import { requireAuth, requireRoles } from "../auth/auth.middleware.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import { createNotificationsForUsers } from "../notifications/notification.service.js";
import { createWorkflowDefinition, decideOnWorkflow, listMyApprovalTasks, listWorkflowDefinitions, submitContractForApproval } from "./workflow.service.js";
import { createWorkflowDefinitionSchema, submitWorkflowSchema, workflowDecisionSchema } from "./workflow.validation.js";

export const workflowRouter = Router();
workflowRouter.use(requireAuth);
const validate = (schema: z.ZodTypeAny): RequestHandler => (req, _res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return next(new HttpError(400, "Request validation failed.", "VALIDATION_ERROR"));
  req.body = parsed.data; next();
};
const idParam = (req: Request, key: string) => {
  const value = req.params[key];
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) throw new HttpError(400, "Invalid resource identifier.", "INVALID_ID");
  return value;
};
workflowRouter.get("/definitions", asyncHandler(async (req, res) => {
  const definitions = await listWorkflowDefinitions(req.auth!.tenantId);
  res.json({ success: true, data: { definitions } });
}));
workflowRouter.post("/definitions", requireRoles("OWNER", "ADMIN"), validate(createWorkflowDefinitionSchema), asyncHandler(async (req, res) => {
  const definition = await createWorkflowDefinition(req.auth!.tenantId, req.auth!.userId, req.body);
  await recordAuditEvent({ tenantId: req.auth!.tenantId, actorId: req.auth!.userId, action: "WORKFLOW_CREATED", resourceType: "WORKFLOW", resourceId: definition.id, summary: `Created approval workflow: ${definition.name}` });
  res.status(201).json({ success: true, data: { definition } });
}));
workflowRouter.post("/contracts/:contractId/submit", validate(submitWorkflowSchema), asyncHandler(async (req, res) => {
  const instance = await submitContractForApproval(req.auth!.tenantId, req.auth!.userId, req.auth!.role, idParam(req, "contractId"), req.body.workflowDefinitionId);
  await recordAuditEvent({ tenantId: req.auth!.tenantId, actorId: req.auth!.userId, action: "APPROVAL_SUBMITTED", resourceType: "CONTRACT", resourceId: idParam(req, "contractId"), summary: "Submitted contract for approval", metadata: { workflowInstanceId: instance.id } });
  const approvers = (instance.stages[0]?.approverUserIds ?? []).map(id => id.toString());
  await createNotificationsForUsers({ tenantId: req.auth!.tenantId, userIds: approvers, type: "APPROVAL_ASSIGNED", title: "Contract approval assigned", body: "A contract is waiting for your review.", link: "/?view=approvals", dedupeKey: `approval:${instance.id}:stage:0` });
  res.status(201).json({ success: true, data: { instance } });
}));
workflowRouter.get("/tasks/mine", asyncHandler(async (req, res) => {
  const tasks = await listMyApprovalTasks(req.auth!.tenantId, req.auth!.userId);
  res.json({ success: true, data: { tasks } });
}));
workflowRouter.post("/instances/:instanceId/decision", validate(workflowDecisionSchema), asyncHandler(async (req, res) => {
  const instance = await decideOnWorkflow(req.auth!.tenantId, req.auth!.userId, idParam(req, "instanceId"), req.body);
  await recordAuditEvent({ tenantId: req.auth!.tenantId, actorId: req.auth!.userId, action: `APPROVAL_${req.body.decision}`, resourceType: "WORKFLOW_INSTANCE", resourceId: instance.id, summary: `Recorded approval decision: ${req.body.decision}`, metadata: { decision: req.body.decision } });
  if (instance.status === "IN_PROGRESS") {
    const activeStage = instance.stages[instance.currentStageIndex];
    const approvers = (activeStage?.approverUserIds ?? []).map(id => id.toString());
    await createNotificationsForUsers({ tenantId: req.auth!.tenantId, userIds: approvers, type: "APPROVAL_ASSIGNED", title: "Contract approval assigned", body: "A contract is waiting for your review.", link: "/?view=approvals", dedupeKey: `approval:${instance.id}:stage:${instance.currentStageIndex}` });
  }
  res.json({ success: true, data: { instance } });
}));
