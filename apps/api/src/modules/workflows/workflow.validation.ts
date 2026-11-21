import { z } from "zod";
import { APPROVAL_MODES } from "./workflow.model.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "A valid user or workflow ID is required.");
const stageSchema = z.object({
  name: z.string().trim().min(2).max(80),
  approvalMode: z.enum(APPROVAL_MODES),
  approverUserIds: z.array(objectId).min(1).max(10).refine(ids => new Set(ids.map(id => id.toLowerCase())).size === ids.length, "Approvers must be unique within a stage.")
}).strict();

export const createWorkflowDefinitionSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional(),
  stages: z.array(stageSchema).min(1).max(10)
}).strict();

export const submitWorkflowSchema = z.object({
  workflowDefinitionId: objectId
}).strict();

export const workflowDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().trim().max(1000).optional()
}).strict();
