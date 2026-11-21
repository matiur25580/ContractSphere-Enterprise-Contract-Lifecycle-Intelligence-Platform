import { Schema, model, Types } from "mongoose";

export interface UploadIntentDocument {
  tenantId: Types.ObjectId;
  contractId: Types.ObjectId;
  userId: Types.ObjectId;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: Date;
  completedAt?: Date;
  processingAt?: Date;
  processingBy?: string;
  quarantinedAt?: Date;
  scanStatus?: "CLEAN" | "INFECTED" | "REJECTED" | "ERROR";
  scanResult?: string;
}
const schema = new Schema<UploadIntentDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  contractId: { type: Schema.Types.ObjectId, ref: "Contract", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  objectKey: { type: String, required: true, unique: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
  completedAt: Date,
  processingAt: Date,
  processingBy: { type: String, maxlength: 80 },
  quarantinedAt: Date,
  scanStatus: { type: String, enum: ["CLEAN", "INFECTED", "REJECTED", "ERROR"] },
  scanResult: { type: String, maxlength: 240 }
}, { timestamps: true });
export const UploadIntent = model<UploadIntentDocument>("UploadIntent", schema);
