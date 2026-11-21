import { Schema, model, Types } from "mongoose";

export const VENDOR_STATUSES = ["ACTIVE", "UNDER_REVIEW", "INACTIVE"] as const;
export const VENDOR_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const VENDOR_CATEGORIES = ["SUPPLIER", "SERVICE_PROVIDER", "CUSTOMER", "PARTNER", "CONSULTANT", "OTHER"] as const;
export interface VendorDocument {
  tenantId: Types.ObjectId; legalName: string; normalizedName: string; displayName?: string; category: typeof VENDOR_CATEGORIES[number];
  status: typeof VENDOR_STATUSES[number]; website?: string; industry?: string; country?: string; taxId?: string;
  aliases: string[]; tags: string[];
  contacts: Array<{ name: string; title?: string; email: string; phone?: string; primary: boolean }>;
  certifications: Array<{ name: string; reference?: string; expiresAt?: Date; status: "VALID" | "EXPIRED" | "PENDING" }>;
  riskLevel: typeof VENDOR_RISK_LEVELS[number]; riskScore: number;
  riskFactors: string[]; lastAssessedAt?: Date; createdBy: Types.ObjectId; updatedBy: Types.ObjectId;
  assessmentHistory: Array<{ score: number; level: string; factors: string[]; notes?: string; assessedBy: Types.ObjectId; assessedAt: Date }>;
}
const contactSchema = new Schema({ name: { type: String, required: true, trim: true, maxlength: 100 }, title: { type: String, trim: true, maxlength: 100 }, email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 }, phone: { type: String, trim: true, maxlength: 40 }, primary: { type: Boolean, default: false } }, { _id: false });
const certificationSchema = new Schema({ name: { type: String, required: true, trim: true, maxlength: 120 }, reference: { type: String, trim: true, maxlength: 120 }, expiresAt: Date, status: { type: String, enum: ["VALID", "EXPIRED", "PENDING"], default: "PENDING" } }, { _id: false });
const assessmentSchema = new Schema({ score: { type: Number, min: 0, max: 100, required: true }, level: { type: String, enum: VENDOR_RISK_LEVELS, required: true }, factors: [{ type: String, trim: true, maxlength: 160 }], notes: { type: String, trim: true, maxlength: 2000 }, assessedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }, assessedAt: { type: Date, required: true } }, { _id: false });
const schema = new Schema<VendorDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  legalName: { type: String, required: true, trim: true, maxlength: 180 },
  normalizedName: { type: String, required: true, lowercase: true, trim: true },
  displayName: { type: String, trim: true, maxlength: 120 },
  category: { type: String, enum: VENDOR_CATEGORIES, default: "SUPPLIER", required: true },
  status: { type: String, enum: VENDOR_STATUSES, default: "ACTIVE", required: true },
  website: { type: String, trim: true, maxlength: 255 }, industry: { type: String, trim: true, maxlength: 100 },
  country: { type: String, trim: true, maxlength: 100 }, taxId: { type: String, trim: true, maxlength: 100 },
  aliases: [{ type: String, trim: true, lowercase: true, maxlength: 180 }],
  tags: [{ type: String, trim: true, lowercase: true, maxlength: 32 }],
  contacts: { type: [contactSchema], default: [] }, certifications: { type: [certificationSchema], default: [] },
  riskLevel: { type: String, enum: VENDOR_RISK_LEVELS, default: "LOW", required: true },
  riskScore: { type: Number, min: 0, max: 100, default: 0, required: true },
  riskFactors: [{ type: String, trim: true, maxlength: 160 }], lastAssessedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  assessmentHistory: { type: [assessmentSchema], default: [] }
}, { timestamps: true });
schema.index({ tenantId: 1, normalizedName: 1 }, { unique: true });
schema.index({ tenantId: 1, status: 1, riskLevel: 1 });
schema.index({ tenantId: 1, category: 1, updatedAt: -1 });
schema.index({ tenantId: 1, legalName: "text", displayName: "text", aliases: "text", industry: "text" });
export const Vendor = model<VendorDocument>("Vendor", schema);
