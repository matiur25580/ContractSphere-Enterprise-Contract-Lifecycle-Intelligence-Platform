import { Schema, model } from "mongoose";
const clauseVersionSchema = new Schema({ version: { type: Number, required: true }, body: { type: String, required: true, maxlength: 20000 }, createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }, createdAt: { type: Date, default: Date.now, required: true } }, { _id: false });
const clauseSchema = new Schema({
 tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
 key: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
 title: { type: String, required: true, trim: true, maxlength: 160 },
 category: { type: String, required: true, trim: true, maxlength: 80 },
 body: { type: String, required: true, maxlength: 20000 },
 version: { type: Number, required: true, default: 1 },
 versions: { type: [clauseVersionSchema], default: [] },
 status: { type: String, enum: ["ACTIVE", "ARCHIVED"], default: "ACTIVE", required: true },
 createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
 updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true, versionKey: "__v" });
clauseSchema.index({ tenantId: 1, key: 1 }, { unique: true });
clauseSchema.index({ tenantId: 1, status: 1, category: 1 });
export const Clause = model("Clause", clauseSchema);
