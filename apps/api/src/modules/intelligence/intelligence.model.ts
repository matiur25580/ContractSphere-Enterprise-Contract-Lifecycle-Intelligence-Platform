import { Schema, model } from "mongoose";
const evidenceSchema = new Schema({ excerpt: { type: String, maxlength: 500 }, start: Number, end: Number }, { _id: false });
const findingSchema = new Schema({
 key: { type: String, required: true }, category: { type: String, required: true },
 title: { type: String, required: true }, severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], required: true },
 confidence: { type: Number, min: 0, max: 1, required: true }, explanation: { type: String, required: true },
 evidence: { type: evidenceSchema, default: null }
}, { _id: false });
const clauseSchema = new Schema({
 key: String, label: String, found: Boolean, evidence: { type: evidenceSchema, default: null }
}, { _id: false });
const reportSchema = new Schema({
 tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
 contractId: { type: Schema.Types.ObjectId, ref: "Contract", required: true, index: true },
 createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
 sourceLabel: { type: String, required: true, maxlength: 120 },
 sourceFingerprint: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
 sourceLength: { type: Number, required: true, min: 1, max: 30000 },
 engine: { type: String, enum: ["RULE_BASED", "AI_COMPATIBLE"], required: true },
 analysisVersion: { type: String, required: true },
 provider: { type: String, maxlength: 160 },
 modelName: { type: String, maxlength: 120 },
 summary: { type: String, required: true, maxlength: 500 },
 findings: { type: [findingSchema], default: [] },
 extractedClauses: { type: [clauseSchema], default: [] },
 missingTerms: { type: [String], default: [] },
 riskCounts: { LOW: Number, MEDIUM: Number, HIGH: Number, CRITICAL: Number }
}, { timestamps: true, versionKey: false });
reportSchema.index({ tenantId: 1, contractId: 1, createdAt: -1 });
export const ContractIntelligenceReport = model("ContractIntelligenceReport", reportSchema);
