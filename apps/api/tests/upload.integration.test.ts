import mongoose, { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inspectStoredObject: vi.fn(),
  readStoredObject: vi.fn(),
  quarantineStoredObject: vi.fn(),
  createUploadUrl: vi.fn(),
  createDownloadUrl: vi.fn(),
  verifyDocumentSignature: vi.fn(),
  scanForMalware: vi.fn(),
  recordAuditEvent: vi.fn()
}));

vi.mock("../src/modules/contracts/storage.service.js", () => mocks);
vi.mock("../src/modules/contracts/document-security.service.js", () => ({
  verifyDocumentSignature: mocks.verifyDocumentSignature,
  scanForMalware: mocks.scanForMalware
}));
vi.mock("../src/modules/audit/audit.service.js", () => ({
  recordAuditEvent: mocks.recordAuditEvent
}));

import { Contract } from "../src/modules/contracts/contract.model.js";
import { ContractFile } from "../src/modules/contracts/contract-file.model.js";
import { UploadIntent } from "../src/modules/contracts/upload-intent.model.js";
import { completeDocumentUpload } from "../src/modules/contracts/contract.service.js";
import { DocumentProcessingJob } from "../src/modules/intelligence/document-job.model.js";
import { User } from "../src/modules/users/user.model.js";

const uri = process.env.MONGODB_URI?.replace(/\/[^/?]+(?=\\?|$)/, "/contractsphere_uploads");
const newId = () => new Types.ObjectId();

describe.skipIf(!uri)("document upload completion — MongoDB integration", () => {
  const tenantId = newId();
  let userId: Types.ObjectId;
  let contractId: Types.ObjectId;
  let uploadId: Types.ObjectId;

  beforeAll(async () => {
    await mongoose.connect(uri!);
    await Promise.all([
      User.syncIndexes(),
      Contract.syncIndexes(),
      ContractFile.syncIndexes(),
      UploadIntent.syncIndexes(),
      DocumentProcessingJob.syncIndexes()
    ]);
  });

  beforeEach(async () => {
    mocks.inspectStoredObject.mockReset().mockResolvedValue({ sizeBytes: 64, contentType: "application/pdf" });
    mocks.readStoredObject.mockReset().mockResolvedValue(Buffer.from("%PDF-1.7 synthetic test"));
    mocks.quarantineStoredObject.mockReset().mockResolvedValue("quarantine/test.pdf");
    mocks.verifyDocumentSignature.mockReset().mockImplementation(() => undefined);
    mocks.scanForMalware.mockReset().mockResolvedValue({ clean: true });
    mocks.recordAuditEvent.mockReset().mockResolvedValue(undefined);

    const user = await User.create({
      _id: newId(), tenantId, name: "Upload tester", email: "upload-tester@example.test",
      passwordHash: "test-only-hash", role: "OWNER", status: "active"
    });
    userId = user._id;
    const contract = await Contract.create({
      _id: newId(), tenantId, title: "Upload integration agreement",
      contractNumber: new Types.ObjectId().toString(), type: "NDA", status: "DRAFT",
      counterparty: "Upload test counterparty", ownerId: userId, createdBy: userId,
      updatedBy: userId, currency: "USD", tags: [], latestVersion: 0
    });
    contractId = contract._id;
    const intent = await UploadIntent.create({
      _id: newId(), tenantId, contractId, userId,
      objectKey: "tenants/test/contracts/test/upload-integration.pdf",
      originalName: "agreement.pdf", mimeType: "application/pdf", sizeBytes: 64,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });
    uploadId = intent._id;
  });

  afterEach(async () => {
    await Promise.all([
      DocumentProcessingJob.deleteMany({}),
      UploadIntent.deleteMany({}),
      ContractFile.deleteMany({}),
      Contract.deleteMany({}),
      User.deleteMany({})
    ]);
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  const complete = () => completeDocumentUpload(tenantId.toString(), userId.toString(), uploadId.toString(), "OWNER");

  it("registers the file, advances the contract, enqueues one job, and completes the intent atomically", async () => {
    const result = await complete();
    expect(result.file.version).toBe(1);
    expect(result.job.status).toBe("QUEUED");
    expect(await ContractFile.countDocuments({ contractId })).toBe(1);
    expect(await DocumentProcessingJob.countDocuments({ tenantId, contractId, fileId: result.file._id })).toBe(1);

    const contract = await Contract.findById(contractId);
    expect(contract?.latestVersion).toBe(1);
    expect(contract?.latestDocumentId?.toString()).toBe(result.file.id);

    const intent = await UploadIntent.findById(uploadId).lean();
    expect(intent?.completedAt).toBeInstanceOf(Date);
    expect(intent?.processingAt).toBeUndefined();
    expect(intent?.processingBy).toBeUndefined();
  });

  it("returns the existing file and job when the client retries after a successful completion", async () => {
    const first = await complete();
    const second = await complete();
    expect(second.file.id).toBe(first.file.id);
    expect(second.job.id).toBe(first.job.id);
    expect(mocks.scanForMalware).toHaveBeenCalledTimes(1);
    expect(await ContractFile.countDocuments({ contractId })).toBe(1);
    expect(await DocumentProcessingJob.countDocuments({ contractId })).toBe(1);
  });

  it("allows only one concurrent completion to perform storage scanning", async () => {
    let scanStarted!: () => void;
    let releaseScan!: () => void;
    const started = new Promise<void>(resolve => { scanStarted = resolve; });
    const gate = new Promise<void>(resolve => { releaseScan = resolve; });
    mocks.scanForMalware.mockImplementation(async () => {
      scanStarted();
      await gate;
      return { clean: true };
    });

    const firstPromise = complete();
    await started;
    await expect(complete()).rejects.toMatchObject({
      statusCode: 409,
      code: "UPLOAD_COMPLETION_IN_PROGRESS"
    });
    releaseScan();
    const first = await firstPromise;
    expect(first.file.version).toBe(1);
    expect(mocks.scanForMalware).toHaveBeenCalledTimes(1);
    expect(await ContractFile.countDocuments({ contractId })).toBe(1);
    expect(await DocumentProcessingJob.countDocuments({ contractId })).toBe(1);
  });

  it("rolls back file, contract, job and intent changes when queue persistence fails, then permits retry", async () => {
    const createSpy = vi.spyOn(DocumentProcessingJob, "create").mockRejectedValueOnce(new Error("simulated queue write failure"));
    await expect(complete()).rejects.toThrow("simulated queue write failure");
    expect(await ContractFile.countDocuments({ contractId })).toBe(0);
    expect(await DocumentProcessingJob.countDocuments({ contractId })).toBe(0);
    expect((await Contract.findById(contractId))?.latestVersion).toBe(0);
    const pendingIntent = await UploadIntent.findById(uploadId).lean();
    expect(pendingIntent?.completedAt).toBeUndefined();
    expect(pendingIntent?.processingBy).toBeUndefined();

    createSpy.mockRestore();
    const retried = await complete();
    expect(retried.file.version).toBe(1);
    expect(await DocumentProcessingJob.countDocuments({ contractId })).toBe(1);
  });

  it("releases the completion lease after a transient malware scanner failure", async () => {
    mocks.scanForMalware.mockRejectedValueOnce(new Error("scanner temporarily unavailable"));
    await expect(complete()).rejects.toThrow("scanner temporarily unavailable");
    const intent = await UploadIntent.findById(uploadId).lean();
    expect(intent?.processingBy).toBeUndefined();
    mocks.scanForMalware.mockResolvedValueOnce({ clean: true });
    const retried = await complete();
    expect(retried.file.version).toBe(1);
  });
});
