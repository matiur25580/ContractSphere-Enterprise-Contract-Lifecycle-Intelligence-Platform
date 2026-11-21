import { Schema, model, Types } from "mongoose";

export const OBLIGATION_TYPES = ["PAYMENT", "DELIVERABLE", "SLA", "COMPLIANCE", "NOTICE", "OTHER"] as const;
export const OBLIGATION_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE", "CANCELLED"] as const;
export const OBLIGATION_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type ObligationType = typeof OBLIGATION_TYPES[number];
export type ObligationStatus = typeof OBLIGATION_STATUSES[number];
export type ObligationPriority = typeof OBLIGATION_PRIORITIES[number];

export interface ObligationDocument {
  tenantId: Types.ObjectId; contractId: Types.ObjectId; title: string; description?: string;
  type: ObligationType; status: ObligationStatus; priority: ObligationPriority;
  ownerId: Types.ObjectId; dueDate: Date; amount?: number; currency?: string;
  completedAt?: Date; createdBy: Types.ObjectId; updatedBy: Types.ObjectId;
}
const schema = new Schema<ObligationDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  contractId: { type: Schema.Types.ObjectId, ref: "Contract", required: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, trim: true, maxlength: 2000 },
  type: { type: String, enum: OBLIGATION_TYPES, required: true },
  status: { type: String, enum: OBLIGATION_STATUSES, default: "PENDING", required: true },
  priority: { type: String, enum: OBLIGATION_PRIORITIES, default: "MEDIUM", required: true },
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  dueDate: { type: Date, required: true },
  amount: { type: Number, min: 0 },
  currency: { type: String, uppercase: true, minlength: 3, maxlength: 3 },
  completedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });
schema.index({ tenantId: 1, dueDate: 1, status: 1 });
schema.index({ tenantId: 1, contractId: 1, dueDate: 1 });
schema.index({ tenantId: 1, ownerId: 1, status: 1 });
export const Obligation = model<ObligationDocument>("Obligation", schema);
