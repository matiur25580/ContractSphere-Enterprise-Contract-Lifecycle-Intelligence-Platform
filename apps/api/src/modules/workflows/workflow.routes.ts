import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { HttpError } from "../../common/http-error.js";
import { requireAuth, requireRoles } from "../auth/auth.middleware.js";
import { createWorkflowDefinition, decideOnWorkflow, listMyApprovalTasks, listWorkflowDefinitions, submitContractForApproval } from "./workflow.service.js";
import { createWorkflowDefinitionSchema, submitWorkflowSchema, workflowDecisionSchema } from "./workflow.validation.js";

export const workflowRouter = Router();
workflowRouter.use(requireAuth);

const validate = (schema: z.ZodTypeAny): RequestHandler => (req, _res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return next(new HttpError(400, "Request validation failed.", "VALIDATION_ERROR"));
  req.body = parsed.data;
  next();
};
const idParam = (req: Request, key: string) => {
  const value = req.params[key];
  if (typeof value !== "string" || !/^[a-f\\d]{24}$/i.test(value)) throw new HttpError(400, "Invalid resource identifier.", "INVALID_ID");
  return value;
};

workflowRouter.get("/definitions", asyncHandler(async (req, res) => {
  const definitions = await listWorkflowDefinitions(req.auth!.tenantId);
  res.json({ success: true, data: { definitions } });
}));

workflowRouter.post("/definitions", requireRoles("OWNER", "ADMIN"), validate(createWorkflowDefinitionSchema), asyncHandler(async (req, res) => {
  const definition = await createWorkflowDefinition(req.auth!.tenantId, req.auth!.userId, req.body);
  res.status(201).json({ success: true, data: { definition } });
}));

workflowRouter.post("/contracts/:contractId/submit", validate(submitWorkflowSchema), asyncHandler(async (req, res) => {
  const instance = await submitContractForApproval(req.auth!.tenantId, req.auth!.userId, req.auth!.role, idParam(req, "contractId"), req.body.workflowDefinitionId);
  res.status(201).json({ success: true, data: { instance } });
}));

workflowRouter.get("/tasks/mine", asyncHandler(async (req, res) => {
  const tasks = await listMyApprovalTasks(req.auth!.tenantId, req.auth!.userId);
  res.json({ success: true, data: { tasks } });
}));

workflowRouter.post("/instances/:instanceId/decision", validate(workflowDecisionSchema), asyncHandler(async (req, res) => {
  const instance = await decideOnWorkflow(req.auth!.tenantId, req.auth!.userId, idParam(req, "instanceId"), req.body);
  res.json({ success: true, data: { instance } });
}));
