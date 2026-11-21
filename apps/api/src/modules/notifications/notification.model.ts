import { Schema, model, models } from "mongoose";

const notificationSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, required: true },
  userId: { type: Schema.Types.ObjectId, required: true },
  type: { type: String, required: true, maxlength: 60 },
  title: { type: String, required: true, maxlength: 160 },
  body: { type: String, required: true, maxlength: 500 },
  link: { type: String, maxlength: 240 },
  dedupeKey: { type: String, maxlength: 180 },
  readAt: { type: Date, default: null }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, strict: "throw" });

notificationSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, userId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } });
export const Notification = models.Notification || model("Notification", notificationSchema);
