import { Schema, model, Types } from "mongoose";

export const APPROVAL_MODES = ["ALL", "ANY"] as const;
export const WORKFLOW_STATUSES = ["IN_PROGRESS", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type ApprovalMode = typeof APPROVAL_MODES[number];
export type WorkflowStatus = typeof WORKFLOW_STATUSES[number];

export interface WorkflowDefinitionStage {
  name: string;
  approvalMode: ApprovalMode;
  approverUserIds: Types.ObjectId[];
}
export interface WorkflowDecision {
  userId: Types.ObjectId;
  decision: "APPROVE" | "REJECT";
  comment?: string;
  decidedAt: Date;
}
export interface WorkflowExecutionStage extends WorkflowDefinitionStage {
  status: "PENDING" | "APPROVED" | "REJECTED";
  decisions: WorkflowDecision[];
}
export interface WorkflowDefinitionDocument {
  tenantId: Types.ObjectId;
  name: string;
  description?: string;
  stages: WorkflowDefinitionStage[];
  isActive: boolean;
  createdBy: Types.ObjectId;
}
export interface WorkflowInstanceDocument {
  tenantId: Types.ObjectId;
  contractId: Types.ObjectId;
  definitionId: Types.ObjectId;
  definitionName: string;
  submittedBy: Types.ObjectId;
  status: WorkflowStatus;
  currentStageIndex: number;
  stages: WorkflowExecutionStage[];
  active: boolean;
  startedAt: Date;
  completedAt?: Date;
}

const definitionStageSchema = new Schema<WorkflowDefinitionStage>({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  approvalMode: { type: String, enum: APPROVAL_MODES, required: true },
  approverUserIds: [{ type: Schema.Types.ObjectId, ref: "User", required: true }]
}, { _id: false });

const decisionSchema = new Schema<WorkflowDecision>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  decision: { type: String, enum: ["APPROVE", "REJECT"], required: true },
  comment: { type: String, trim: true, maxlength: 1000 },
  decidedAt: { type: Date, required: true }
}, { _id: false });

const executionStageSchema = new Schema<WorkflowExecutionStage>({
  name: { type: String, required: true },
  approvalMode: { type: String, enum: APPROVAL_MODES, required: true },
  approverUserIds: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING", required: true },
  decisions: { type: [decisionSchema], default: [] }
}, { _id: false });

const definitionSchema = new Schema<WorkflowDefinitionDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 1000 },
  stages: { type: [definitionStageSchema], required: true },
  isActive: { type: Boolean, default: true, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });
definitionSchema.index({ tenantId: 1, name: 1 }, { unique: true });

const instanceSchema = new Schema<WorkflowInstanceDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  contractId: { type: Schema.Types.ObjectId, ref: "Contract", required: true },
  definitionId: { type: Schema.Types.ObjectId, ref: "WorkflowDefinition", required: true },
  definitionName: { type: String, required: true },
  submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: WORKFLOW_STATUSES, default: "IN_PROGRESS", required: true },
  currentStageIndex: { type: Number, min: 0, required: true },
  stages: { type: [executionStageSchema], required: true },
  active: { type: Boolean, default: true, required: true },
  startedAt: { type: Date, default: Date.now, required: true },
  completedAt: Date
}, { timestamps: true });
instanceSchema.index({ tenantId: 1, contractId: 1, active: 1 }, { unique: true, partialFilterExpression: { active: true } });
instanceSchema.index({ tenantId: 1, active: 1, status: 1, startedAt: -1 });

export const WorkflowDefinition = model<WorkflowDefinitionDocument>("WorkflowDefinition", definitionSchema);
export const WorkflowInstance = model<WorkflowInstanceDocument>("WorkflowInstance", instanceSchema);
