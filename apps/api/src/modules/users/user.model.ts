import { Schema, model, Types } from "mongoose";

export type UserRole = "OWNER" | "ADMIN" | "MEMBER";
export interface UserDocument {
  tenantId: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: "active" | "disabled";
}
const userSchema = new Schema<UserDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["OWNER", "ADMIN", "MEMBER"], default: "MEMBER", required: true },
  status: { type: String, enum: ["active", "disabled"], default: "active", required: true }
}, { timestamps: true });
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
export const User = model<UserDocument>("User", userSchema);
