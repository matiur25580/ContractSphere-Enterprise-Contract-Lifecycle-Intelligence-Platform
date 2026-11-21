import mongoose, { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  createUploadUrl: vi.fn(),
  createDownloadUrl: vi.fn(),
  inspectStoredObject: vi.fn(),
  readStoredObject: vi.fn(),
  quarantineStoredObject: vi.fn()
}));
vi.mock("../src/modules/contracts/storage.service.js", () => storageMocks);
vi.mock("../src/modules/contracts/document-security.service.js", () => ({
  verifyDocumentSignature: vi.fn(),
  scanForMalware: vi.fn()
}));
vi.mock("../src/modules/audit/audit.service.js", () => ({
  recordAuditEvent: vi.fn()
}));

import { Contract } from "../src/modules/contracts/contract.model.js";
import { ContractFile } from "../src/modules/contracts/contract-file.model.js";
import { getContract, getDocumentDownloadUrl } from "../src/modules/contracts/contract.service.js";
import { DocumentProcessingJob } from "../src/modules/intelligence/document-job.model.js";
import { getDocumentAnalysisJob, listRecentDocumentJobs } from "../src/modules/intelligence/document-job.service.js";
import { User } from "../src/modules/users/user.model.js";

const uri = process.env.MONGODB_URI?.replace(/\/[^/?]+(\?.*)?$/, "/contractsphere_access$1");
const newId = () => new Types.ObjectId();

describe.skipIf(!uri)("tenant resource access — MongoDB integration", () => {
  const tenantA = newId();
  const tenantB = newId();
  let ownerA: Types.ObjectId;
  let memberA: Types.ObjectId;
  let ownerB: Types.ObjectId;
  let contractA: Types.ObjectId;
  let contractB: Types.ObjectId;
  let fileA: Types.ObjectId;
  let fileB: Types.ObjectId;
  let jobA: Types.ObjectId;
  let jobB: Types.ObjectId;

  beforeAll(async () => {
    await mongoose.connect(uri!);
    await Promise.all([
      User.syncIndexes(),
      Contract.syncIndexes(),
      ContractFile.syncIndexes(),
      DocumentProcessingJob.syncIndexes()
    ]);
  });

  beforeEach(async () => {
    storageMocks.createDownloadUrl.mockReset().mockResolvedValue("https://storage.example.test/signed-download");
    const [ownerUserA, memberUserA, ownerUserB] = await Promise.all([
      User.create({ _id: newId(), tenantId: tenantA, name: "Tenant A owner", email: "owner-a@example.test", passwordHash: "test-hash", role: "OWNER", status: "active" }),
      User.create({ _id: newId(), tenantId: tenantA, name: "Tenant A member", email: "member-a@example.test", passwordHash: "test-hash", role: "MEMBER", status: "active" }),
      User.create({ _id: newId(), tenantId: tenantB, name: "Tenant B owner", email: "owner-b@example.test", passwordHash: "test-hash", role: "OWNER", status: "active" })
    ]);
    ownerA = ownerUserA._id;
    memberA = memberUserA._id;
    ownerB = ownerUserB._id;

    const [a, b] = await Promise.all([
      Contract.create({
        _id: newId(), tenantId: tenantA, title: "Tenant A contract",
        contractNumber: "A-" + newId().toString(), type: "NDA", status: "DRAFT",
        counterparty: "A Counterparty", ownerId: ownerA, createdBy: ownerA, updatedBy: ownerA,
        currency: "USD", tags: [], latestVersion: 1
      }),
      Contract.create({
        _id: newId(), tenantId: tenantB, title: "Tenant B contract",
        contractNumber: "B-" + newId().toString(), type: "NDA", status: "DRAFT",
        counterparty: "B Counterparty", ownerId: ownerB, createdBy: ownerB, updatedBy: ownerB,
        currency: "USD", tags: [], latestVersion: 1
      })
    ]);
    contractA = a._id;
    contractB = b._id;

    const [fa, fb] = await Promise.all([
      ContractFile.create({
        _id: newId(), tenantId: tenantA, contractId: contractA, version: 1,
        originalName: "tenant-a.pdf", objectKey: "tenant-a/object.pdf", mimeType: "application/pdf",
        sizeBytes: 64, uploadedBy: ownerA
      }),
      ContractFile.create({
        _id: newId(), tenantId: tenantB, contractId: contractB, version: 1,
        originalName: "tenant-b.pdf", objectKey: "tenant-b/object.pdf", mimeType: "application/pdf",
        sizeBytes: 64, uploadedBy: ownerB
      })
    ]);
    fileA = fa._id;
    fileB = fb._id;

    const [ja, jb] = await Promise.all([
      DocumentProcessingJob.create({
        _id: newId(), tenantId: tenantA, contractId: contractA, fileId: fileA,
        requestedBy: ownerA, role: "OWNER", engine: "RULE_BASED", status: "QUEUED",
        attempts: 0, maxAttempts: 3, nextRunAt: new Date()
      }),
      DocumentProcessingJob.create({
        _id: newId(), tenantId: tenantB, contractId: contractB, fileId: fileB,
        requestedBy: ownerB, role: "OWNER", engine: "RULE_BASED", status: "QUEUED",
        attempts: 0, maxAttempts: 3, nextRunAt: new Date()
      })
    ]);
    jobA = ja._id;
    jobB = jb._id;
  });

  afterEach(async () => {
    await Promise.all([
      DocumentProcessingJob.deleteMany({}),
      ContractFile.deleteMany({}),
      Contract.deleteMany({}),
      User.deleteMany({})
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("returns only the current tenant's contract and document versions", async () => {
    const result = await getContract(tenantA.toString(), contractA.toString());
    expect(result.title).toBe("Tenant A contract");
    expect(result.versions.map(version => version._id.toString())).toEqual([fileA.toString()]);
    await expect(getContract(tenantB.toString(), contractA.toString()))
      .rejects.toMatchObject({ statusCode: 404, code: "CONTRACT_NOT_FOUND" });
  });

  it("does not generate a download URL for a cross-tenant document identifier", async () => {
    await expect(getDocumentDownloadUrl(tenantB.toString(), contractA.toString(), fileA.toString()))
      .rejects.toMatchObject({ statusCode: 404, code: "DOCUMENT_NOT_FOUND" });
    expect(storageMocks.createDownloadUrl).not.toHaveBeenCalled();

    const allowed = await getDocumentDownloadUrl(tenantA.toString(), contractA.toString(), fileA.toString());
    expect(allowed.downloadUrl).toBe("https://storage.example.test/signed-download");
    expect(storageMocks.createDownloadUrl).toHaveBeenCalledOnce();
  });

  it("scopes processing-job status to tenant and contract ownership", async () => {
    const allowed = await getDocumentAnalysisJob(tenantA.toString(), ownerA.toString(), "OWNER", contractA.toString(), jobA.toString());
    expect(allowed._id.toString()).toBe(jobA.toString());

    await expect(getDocumentAnalysisJob(tenantA.toString(), memberA.toString(), "MEMBER", contractA.toString(), jobA.toString()))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    await expect(getDocumentAnalysisJob(tenantB.toString(), ownerB.toString(), "OWNER", contractA.toString(), jobA.toString()))
      .rejects.toMatchObject({ statusCode: 404, code: "CONTRACT_NOT_FOUND" });
  });

  it("limits member job lists to owned or created contracts while admins see the tenant queue", async () => {
    const memberOwnedContract = await Contract.create({
      _id: newId(), tenantId: tenantA, title: "Created by member",
      contractNumber: "A-" + newId().toString(), type: "NDA", status: "DRAFT",
      counterparty: "Member Counterparty", ownerId: ownerA, createdBy: memberA, updatedBy: memberA,
      currency: "USD", tags: [], latestVersion: 0
    });
    const unrelatedContract = await Contract.create({
      _id: newId(), tenantId: tenantA, title: "Unrelated contract",
      contractNumber: "A-" + newId().toString(), type: "NDA", status: "DRAFT",
      counterparty: "Unrelated Counterparty", ownerId: ownerA, createdBy: ownerA, updatedBy: ownerA,
      currency: "USD", tags: [], latestVersion: 0
    });
    const extraJobs = await DocumentProcessingJob.create([
      { tenantId: tenantA, contractId: memberOwnedContract._id, fileId: newId(), requestedBy: memberA, role: "MEMBER", engine: "RULE_BASED", status: "QUEUED", attempts: 0, maxAttempts: 3, nextRunAt: new Date() },
      { tenantId: tenantA, contractId: unrelatedContract._id, fileId: newId(), requestedBy: ownerA, role: "OWNER", engine: "RULE_BASED", status: "QUEUED", attempts: 0, maxAttempts: 3, nextRunAt: new Date() }
    ]);
    const memberList = await listRecentDocumentJobs(tenantA.toString(), memberA.toString(), "MEMBER");
    expect(memberList.jobs.map(job => job._id.toString())).toEqual([extraJobs[0]!._id.toString()]);
    const adminList = await listRecentDocumentJobs(tenantA.toString(), ownerA.toString(), "OWNER");
    expect(adminList.jobs).toHaveLength(4);
    expect(adminList.jobs.some(job => job._id.toString() === jobB.toString())).toBe(false);
  });
});
