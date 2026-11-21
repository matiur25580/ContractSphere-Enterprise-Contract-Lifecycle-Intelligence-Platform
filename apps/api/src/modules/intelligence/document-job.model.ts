import { Schema, model, Types } from "mongoose";

export const DOCUMENT_JOB_STATUSES = ["QUEUED", "PROCESSING", "SUCCEEDED", "FAILED"] as const;
export type DocumentJobStatus = typeof DOCUMENT_JOB_STATUSES[number];

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  contractId: { type: Schema.Types.ObjectId, ref: "Contract", required: true, index: true },
  fileId: { type: Schema.Types.ObjectId, ref: "ContractFile", required: true, index: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  role: { type: String, required: true, enum: ["OWNER", "ADMIN", "MEMBER"] },
  engine: { type: String, required: true, enum: ["RULE_BASED", "AI_COMPATIBLE"], default: "RULE_BASED" },
  status: { type: String, required: true, enum: DOCUMENT_JOB_STATUSES, default: "QUEUED", index: true },
  attempts: { type: Number, required: true, default: 0, min: 0 },
  maxAttempts: { type: Number, required: true, default: 3, min: 1, max: 10 },
  nextRunAt: { type: Date, required: true, default: Date.now, index: true },
  lockedAt: Date,
  lockedBy: String,
  reportId: { type: Schema.Types.ObjectId, ref: "ContractIntelligenceReport" },
  errorCode: { type: String, maxlength: 80 },
  errorMessage: { type: String, maxlength: 300 },
  startedAt: Date,
  completedAt: Date
}, { timestamps: true, versionKey: false });
schema.index({ status: 1, nextRunAt: 1, createdAt: 1 });
schema.index({ tenantId: 1, contractId: 1, createdAt: -1 });
export const DocumentProcessingJob = model("DocumentProcessingJob", schema);
