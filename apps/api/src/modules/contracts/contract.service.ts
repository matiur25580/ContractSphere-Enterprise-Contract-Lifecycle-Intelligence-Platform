import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { HttpError } from "../../common/http-error.js";
import { User } from "../users/user.model.js";
import { Vendor } from "../vendors/vendor.model.js";
import { Contract } from "./contract.model.js";
import { ContractFile } from "./contract-file.model.js";
import { UploadIntent } from "./upload-intent.model.js";
import { createDownloadUrl, createUploadUrl, inspectStoredObject, readStoredObject, quarantineStoredObject } from "./storage.service.js";
import { scanForMalware, verifyDocumentSignature } from "./document-security.service.js";
import { recordAuditEvent } from "../audit/audit.service.js";

const tenantObjectId = (id: string) => new Types.ObjectId(id);
const safeFilename = (name: string) => name.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "document";
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function createContract(tenantId: string, userId: string, input: Record<string, any>) {
  const tenant = tenantObjectId(tenantId);
  const ownerId = input.ownerId ? tenantObjectId(input.ownerId) : tenantObjectId(userId);
  if (input.vendorId && !await Vendor.exists({ _id: input.vendorId, tenantId: tenant, status: "ACTIVE" })) throw new HttpError(400, "Linked vendor must be active and belong to this organization.", "INVALID_VENDOR");
  if (!await User.exists({ _id: ownerId, tenantId: tenant, status: "active" })) throw new HttpError(400, "Contract owner must be an active member of this organization.", "INVALID_CONTRACT_OWNER");
  try {
    return await Contract.create({ ...input, tenantId: tenant, ownerId, createdBy: tenantObjectId(userId), updatedBy: tenantObjectId(userId) });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new HttpError(409, "This contract number is already used in your organization.", "CONTRACT_NUMBER_EXISTS");
    throw error;
  }
}

export async function listContracts(tenantId: string, query: { q?: string; status?: string; type?: string; counterparty?: string; page: number; limit: number; sort: string; order: string }) {
  const filter: Record<string, unknown> = { tenantId: tenantObjectId(tenantId) };
  if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;
  if (query.counterparty) filter.counterparty = { $regex: escapeRegex(query.counterparty), $options: "i" };
  if (query.q) filter.$text = { $search: query.q };
  const sort = { [query.sort]: query.order === "asc" ? 1 : -1 } as Record<string, 1 | -1>;
  const [items, total] = await Promise.all([
    Contract.find(filter).sort(sort).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    Contract.countDocuments(filter)
  ]);
  return { items, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}

export async function getContract(tenantId: string, contractId: string) {
  const tenant = tenantObjectId(tenantId);
  const contract = await Contract.findOne({ _id: contractId, tenantId: tenant }).lean();
  if (!contract) throw new HttpError(404, "Contract not found.", "CONTRACT_NOT_FOUND");
  const versions = await ContractFile.find({ tenantId: tenant, contractId: contract._id }).sort({ version: -1 }).lean();
  return { ...contract, versions };
}

export async function updateContract(tenantId: string, userId: string, contractId: string, changes: Record<string, any>) {
  const tenant = tenantObjectId(tenantId);
  if (changes.ownerId && !await User.exists({ _id: changes.ownerId, tenantId: tenant, status: "active" })) throw new HttpError(400, "Contract owner must be an active member of this organization.", "INVALID_CONTRACT_OWNER");
  if (changes.vendorId && !await Vendor.exists({ _id: changes.vendorId, tenantId: tenant, status: "ACTIVE" })) throw new HttpError(400, "Linked vendor must be active and belong to this organization.", "INVALID_VENDOR");
  const updated = await Contract.findOneAndUpdate(
    { _id: contractId, tenantId: tenant, status: { $ne: "ARCHIVED" } },
    { $set: { ...changes, ...(changes.status === "ARCHIVED" ? { archivedAt: new Date() } : {}), updatedBy: tenantObjectId(userId) } },
    { new: true, runValidators: true }
  );
  if (!updated) throw new HttpError(404, "Contract not found or archived.", "CONTRACT_NOT_FOUND");
  return updated;
}

export async function createDocumentUpload(tenantId: string, userId: string, contractId: string, input: { filename: string; contentType: string; sizeBytes: number }) {
  const tenant = tenantObjectId(tenantId);
  const contract = await Contract.findOne({ _id: contractId, tenantId: tenant, status: { $ne: "ARCHIVED" } });
  if (!contract) throw new HttpError(404, "Contract not found.", "CONTRACT_NOT_FOUND");
  const objectKey = `tenants/${tenantId}/contracts/${contractId}/${randomUUID()}-${safeFilename(input.filename)}`;
  const intent = await UploadIntent.create({
    tenantId: tenant, contractId: contract._id, userId: tenantObjectId(userId), objectKey,
    originalName: input.filename, mimeType: input.contentType, sizeBytes: input.sizeBytes,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000)
  });
  try {
    const uploadUrl = await createUploadUrl({ objectKey, contentType: input.contentType, sizeBytes: input.sizeBytes });
    return { uploadId: intent.id, uploadUrl, method: "PUT", headers: { "Content-Type": input.contentType }, expiresInSeconds: 300 };
  } catch (error) {
    await UploadIntent.deleteOne({ _id: intent._id });
    throw error;
  }
}

export async function completeDocumentUpload(tenantId: string, userId: string, uploadId: string) {
  const tenant = tenantObjectId(tenantId);
  const intent = await UploadIntent.findOne({ _id: uploadId, tenantId: tenant, userId: tenantObjectId(userId), completedAt: null, expiresAt: { $gt: new Date() } });
  if (!intent) throw new HttpError(404, "Upload request not found or expired.", "UPLOAD_INTENT_NOT_FOUND");
  const stored = await inspectStoredObject(intent.objectKey);
  if (stored.sizeBytes !== intent.sizeBytes || stored.contentType !== intent.mimeType) throw new HttpError(400, "Uploaded document metadata does not match the approved upload request.", "UPLOAD_VALIDATION_FAILED");
  const bytes = await readStoredObject(intent.objectKey, 25 * 1024 * 1024);
  try {
    verifyDocumentSignature(bytes, intent.mimeType);
    const scan = await scanForMalware(bytes);
    if (!scan.clean) {
      const quarantineKey = "quarantine/" + tenantId + "/" + randomUUID() + "-" + safeFilename(intent.originalName);
      await quarantineStoredObject(intent.objectKey, quarantineKey);
      await UploadIntent.updateOne({ _id: intent._id }, { $set: { scanStatus: "INFECTED", scanResult: scan.signature, quarantinedAt: new Date() } });
      await recordAuditEvent({
        tenantId, actorId: userId, action: "DOCUMENT_UPLOAD_QUARANTINED", resourceType: "CONTRACT",
        resourceId: intent.contractId.toString(), summary: "A document upload was quarantined after malware detection.",
        metadata: { scanner: "ClamAV", result: scan.signature.slice(0, 180) }
      });
      throw new HttpError(422, "The uploaded document was identified as malicious and moved to quarantine. It was not added to the contract.", "MALWARE_DETECTED");
    }
    await UploadIntent.updateOne({ _id: intent._id }, { $set: { scanStatus: "CLEAN", scanResult: "ClamAV: OK" } });
  } catch (error) {
    if (error instanceof HttpError && error.code === "MALWARE_DETECTED") throw error;
    if (error instanceof HttpError && error.code === "DOCUMENT_SIGNATURE_INVALID") {
      const quarantineKey = "quarantine/" + tenantId + "/" + randomUUID() + "-" + safeFilename(intent.originalName);
      await quarantineStoredObject(intent.objectKey, quarantineKey);
      await UploadIntent.updateOne({ _id: intent._id }, { $set: { scanStatus: "REJECTED", scanResult: error.code, quarantinedAt: new Date() } });
      await recordAuditEvent({
        tenantId, actorId: userId, action: "DOCUMENT_UPLOAD_REJECTED", resourceType: "CONTRACT",
        resourceId: intent.contractId.toString(), summary: "A document upload was quarantined after file signature validation failed.",
        metadata: { reason: error.code }
      });
      throw error;
    }
    await UploadIntent.updateOne({ _id: intent._id }, { $set: { scanStatus: "ERROR", scanResult: error instanceof Error ? error.message.slice(0, 220) : "Unknown scan error" } });
    throw error;
  }
  const contract = await Contract.findOne({ _id: intent.contractId, tenantId: tenant, status: { $ne: "ARCHIVED" } });
  if (!contract) throw new HttpError(404, "Contract not found.", "CONTRACT_NOT_FOUND");

  const version = contract.latestVersion + 1;
  let file;
  try {
    file = await ContractFile.create({
      tenantId: tenant, contractId: contract._id, version, originalName: intent.originalName,
      objectKey: intent.objectKey, mimeType: intent.mimeType, sizeBytes: intent.sizeBytes,
      uploadedBy: tenantObjectId(userId)
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new HttpError(409, "A document version was added concurrently. Please request a fresh upload URL.", "VERSION_CONFLICT");
    throw error;
  }
  const updated = await Contract.findOneAndUpdate(
    { _id: contract._id, tenantId: tenant, latestVersion: contract.latestVersion },
    { $set: { latestVersion: version, latestDocumentId: file._id, updatedBy: tenantObjectId(userId) } },
    { new: true }
  );
  if (!updated) {
    await ContractFile.deleteOne({ _id: file._id });
    throw new HttpError(409, "A new document version was added concurrently. Please retry the upload completion.", "VERSION_CONFLICT");
  }
  await UploadIntent.updateOne({ _id: intent._id, completedAt: null }, { $set: { completedAt: new Date() } });
  return file;
}

export async function getDocumentDownloadUrl(tenantId: string, contractId: string, fileId: string) {
  const tenant = tenantObjectId(tenantId);
  const file = await ContractFile.findOne({ _id: fileId, contractId, tenantId: tenant });
  if (!file) throw new HttpError(404, "Document version not found.", "DOCUMENT_NOT_FOUND");
  return { downloadUrl: await createDownloadUrl(file.objectKey), expiresInSeconds: 60, filename: file.originalName };
}
