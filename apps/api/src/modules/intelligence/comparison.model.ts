import { Schema, model } from "mongoose";
const clauseChangeSchema = new Schema({
  key: { type: String, required: true }, label: { type: String, required: true },
  change: { type: String, enum: ["ADDED", "REMOVED", "UNCHANGED"], required: true },
  baselineEvidence: { type: String, maxlength: 500, default: null },
  candidateEvidence: { type: String, maxlength: 500, default: null }
}, { _id: false });
const findingChangeSchema = new Schema({
  key: { type: String, required: true }, title: { type: String, required: true },
  change: { type: String, enum: ["NEW", "RESOLVED", "CHANGED", "UNCHANGED"], required: true },
  baselineSeverity: { type: String, default: null }, candidateSeverity: { type: String, default: null }
}, { _id: false });
const textChangeSchema = new Schema({
  excerpt: { type: String, required: true, maxlength: 500 }
}, { _id: false });
const comparisonSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  contractId: { type: Schema.Types.ObjectId, ref: "Contract", required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  baselineLabel: { type: String, required: true, maxlength: 120 },
  candidateLabel: { type: String, required: true, maxlength: 120 },
  baselineFingerprint: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  candidateFingerprint: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  baselineLength: { type: Number, required: true, min: 1, max: 30000 },
  candidateLength: { type: Number, required: true, min: 1, max: 30000 },
  similarityScore: { type: Number, min: 0, max: 100, required: true },
  clauseChanges: { type: [clauseChangeSchema], default: [] },
  findingChanges: { type: [findingChangeSchema], default: [] },
  additions: { type: [textChangeSchema], default: [] },
  removals: { type: [textChangeSchema], default: [] },
  summary: { type: String, required: true, maxlength: 500 }
}, { timestamps: true, versionKey: false });
comparisonSchema.index({ tenantId: 1, contractId: 1, createdAt: -1 });
export const ContractComparison = model("ContractComparison", comparisonSchema);
