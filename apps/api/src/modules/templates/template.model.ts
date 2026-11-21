import { Schema, model } from "mongoose";
const fieldSchema = new Schema({
 key: { type: String, required: true, match: /^[a-z][a-zA-Z0-9_]{1,39}$/ },
 label: { type: String, required: true, maxlength: 100 },
 type: { type: String, enum: ["TEXT", "DATE", "NUMBER", "EMAIL", "CHOICE"], required: true },
 required: { type: Boolean, default: true }, options: { type: [String], default: [] }
}, { _id: false });
const sectionSchema = new Schema({
 heading: { type: String, required: true, maxlength: 160 },
 content: { type: String, required: true, maxlength: 20000 },
 clauseId: { type: Schema.Types.ObjectId, ref: "Clause" },
 clauseVersion: { type: Number, min: 1 },
 optional: { type: Boolean, default: false }
}, { _id: false });
const templateSchema = new Schema({
 tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
 name: { type: String, required: true, trim: true, maxlength: 160 },
 description: { type: String, trim: true, maxlength: 1000 },
 contractType: { type: String, enum: ["NDA", "MSA", "SOW", "SUPPLIER", "EMPLOYMENT", "LEASE", "DPA", "OTHER"], required: true },
 version: { type: Number, required: true, default: 1 },
 status: { type: String, enum: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "RETIRED"], default: "DRAFT", required: true },
 fields: { type: [fieldSchema], default: [] }, sections: { type: [sectionSchema], default: [] },
 createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
 updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
 submittedAt: Date, approvedAt: Date,
 approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
 basedOnTemplateId: { type: Schema.Types.ObjectId, ref: "ContractTemplate" }
}, { timestamps: true, versionKey: "__v" });
templateSchema.index({ tenantId: 1, status: 1, updatedAt: -1 });
templateSchema.index({ tenantId: 1, name: 1, version: 1 }, { unique: true });
export const ContractTemplate = model("ContractTemplate", templateSchema);
