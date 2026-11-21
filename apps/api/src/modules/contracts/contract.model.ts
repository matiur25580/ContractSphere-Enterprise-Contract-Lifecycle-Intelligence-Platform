import { Schema, model, Types } from "mongoose";

export const CONTRACT_TYPES = ["NDA", "MSA", "SOW", "SUPPLIER", "EMPLOYMENT", "LEASE", "DPA", "OTHER"] as const;
export const CONTRACT_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "EXECUTED", "EXPIRED", "TERMINATED", "ARCHIVED"] as const;
export type ContractType = typeof CONTRACT_TYPES[number];
export type ContractStatus = typeof CONTRACT_STATUSES[number];

export interface ContractDocument {
  tenantId: Types.ObjectId;
  title: string;
  contractNumber: string;
  type: ContractType;
  status: ContractStatus;
  counterparty: string;
  description?: string;
  ownerId: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  startDate?: Date;
  endDate?: Date;
  currency: string;
  contractValue?: number;
  tags: string[];
  latestVersion: number;
  latestDocumentId?: Types.ObjectId;
  archivedAt?: Date;
}

const schema = new Schema<ContractDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  contractNumber: { type: String, required: true, trim: true, maxlength: 60 },
  type: { type: String, enum: CONTRACT_TYPES, required: true },
  status: { type: String, enum: CONTRACT_STATUSES, default: "DRAFT", required: true },
  counterparty: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 4000 },
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  startDate: Date,
  endDate: Date,
  currency: { type: String, default: "USD", uppercase: true, minlength: 3, maxlength: 3 },
  contractValue: { type: Number, min: 0 },
  tags: [{ type: String, trim: true, lowercase: true, maxlength: 32 }],
  latestVersion: { type: Number, default: 0, min: 0 },
  latestDocumentId: { type: Schema.Types.ObjectId, ref: "ContractFile" },
  archivedAt: Date
}, { timestamps: true, versionKey: "__v" });

schema.index({ tenantId: 1, contractNumber: 1 }, { unique: true });
schema.index({ tenantId: 1, status: 1, updatedAt: -1 });
schema.index({ tenantId: 1, counterparty: 1 });
schema.index({ tenantId: 1, title: "text", counterparty: "text", contractNumber: "text", description: "text" });
export const Contract = model<ContractDocument>("Contract", schema);
