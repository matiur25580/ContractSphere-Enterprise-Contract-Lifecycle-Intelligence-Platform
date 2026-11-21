import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const auditEventSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, required: true },
  action: { type: String, required: true, maxlength: 80 },
  resourceType: { type: String, required: true, maxlength: 60 },
  resourceId: { type: String, required: true, maxlength: 80 },
  summary: { type: String, required: true, maxlength: 240 },
  metadata: { type: Schema.Types.Mixed, default: {} },
  requestId: { type: String, maxlength: 100 },
  occurredAt: { type: Date, required: true, default: Date.now }
}, { versionKey: false, strict: "throw" });

auditEventSchema.index({ tenantId: 1, occurredAt: -1 });
auditEventSchema.index({ tenantId: 1, resourceType: 1, resourceId: 1, occurredAt: -1 });
export type AuditEventDocument = InferSchemaType<typeof auditEventSchema>;
const AuditEventModel = (models.AuditEvent || model("AuditEvent", auditEventSchema)) as Model<any>;
export const AuditEvent: Model<any> = AuditEventModel;
