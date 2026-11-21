import { Schema, model, Types } from "mongoose";

export const RENEWAL_TYPES = ["AUTO", "MANUAL", "NONE"] as const;
export const RENEWAL_STATUSES = ["UPCOMING", "NOTICE_DUE", "RENEWAL_IN_PROGRESS", "RENEWED", "TERMINATED", "EXPIRED"] as const;
export type RenewalType = typeof RENEWAL_TYPES[number];
export type RenewalStatus = typeof RENEWAL_STATUSES[number];
export interface RenewalDocument {
  tenantId: Types.ObjectId; contractId: Types.ObjectId; expiryDate: Date; noticePeriodDays: number;
  noticeDeadline: Date; renewalType: RenewalType; status: RenewalStatus; ownerId: Types.ObjectId;
  notes?: string; createdBy: Types.ObjectId; updatedBy: Types.ObjectId;
}
const schema = new Schema<RenewalDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  contractId: { type: Schema.Types.ObjectId, ref: "Contract", required: true },
  expiryDate: { type: Date, required: true },
  noticePeriodDays: { type: Number, min: 0, max: 3650, required: true },
  noticeDeadline: { type: Date, required: true },
  renewalType: { type: String, enum: RENEWAL_TYPES, required: true },
  status: { type: String, enum: RENEWAL_STATUSES, default: "UPCOMING", required: true },
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  notes: { type: String, trim: true, maxlength: 2000 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });
schema.index({ tenantId: 1, contractId: 1 }, { unique: true });
schema.index({ tenantId: 1, noticeDeadline: 1, status: 1 });
schema.index({ tenantId: 1, expiryDate: 1 });
export const Renewal = model<RenewalDocument>("Renewal", schema);
