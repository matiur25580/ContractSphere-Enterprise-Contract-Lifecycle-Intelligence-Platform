import { Schema, model, Types } from "mongoose";

export interface ContractFileDocument {
  tenantId: Types.ObjectId;
  contractId: Types.ObjectId;
  version: number;
  originalName: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  checksum?: string;
  uploadedBy: Types.ObjectId;
  createdAt: Date;
}
const schema = new Schema<ContractFileDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  contractId: { type: Schema.Types.ObjectId, ref: "Contract", required: true, index: true },
  version: { type: Number, required: true, min: 1 },
  originalName: { type: String, required: true, maxlength: 255 },
  objectKey: { type: String, required: true, unique: true },
  mimeType: { type: String, required: true },
  sizeBytes: { type: Number, required: true, min: 1 },
  checksum: String,
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ tenantId: 1, contractId: 1, version: -1 }, { unique: true });
export const ContractFile = model<ContractFileDocument>("ContractFile", schema);
