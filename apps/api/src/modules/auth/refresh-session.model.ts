import { Schema, model, Types } from "mongoose";

interface RefreshSessionDocument {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  familyId?: string;
  expiresAt: Date;
  revokedAt?: Date;
}
const refreshSessionSchema = new Schema<RefreshSessionDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  familyId: { type: String, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null }
}, { timestamps: true });
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RefreshSession = model<RefreshSessionDocument>("RefreshSession", refreshSessionSchema);
