import { Schema, model } from "mongoose";

export interface TenantDocument {
  name: string;
  slug: string;
  status: "active" | "suspended";
}
const tenantSchema = new Schema<TenantDocument>({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, lowercase: true, trim: true, unique: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  status: { type: String, enum: ["active", "suspended"], default: "active", required: true }
}, { timestamps: true });
export const Tenant = model<TenantDocument>("Tenant", tenantSchema);
