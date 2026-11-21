import mongoose, { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const aiMock = vi.hoisted(() => ({ analyzeWithConfiguredAI: vi.fn() }));
vi.mock("../src/modules/intelligence/ai-provider.service.js", () => aiMock);
import { Contract } from "../src/modules/contracts/contract.model.js";
import { User } from "../src/modules/users/user.model.js";
import { DocumentProcessingJob } from "../src/modules/intelligence/document-job.model.js";
import { ContractIntelligenceReport } from "../src/modules/intelligence/intelligence.model.js";
import { analyzeContract } from "../src/modules/intelligence/intelligence.service.js";

const uri = process.env.MONGODB_URI?.replace(/\/[^/?]+(\?.*)?$/, "/contractsphere_intelligence$1");
const newId = () => new Types.ObjectId();

describe.skipIf(!uri)("document analysis report idempotency — MongoDB integration", () => {
  const tenantId = newId();
  let userId: Types.ObjectId;
  let contractId: Types.ObjectId;
  let jobId: Types.ObjectId;

  beforeAll(async () => {
    await mongoose.connect(uri!);
    await Promise.all([
      User.syncIndexes(),
      Contract.syncIndexes(),
      DocumentProcessingJob.syncIndexes(),
      ContractIntelligenceReport.syncIndexes()
    ]);
  });

  beforeEach(async () => {
    aiMock.analyzeWithConfiguredAI.mockReset().mockResolvedValue({
      engine: "AI_COMPATIBLE", analysisVersion: "mock-ai-v1", provider: "mock-provider",
      modelName: "mock-model", summary: "Mock AI review completed.", findings: [],
      extractedClauses: [], missingTerms: [],
      riskCounts: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }
    });
    const user = await User.create({
      _id: newId(), tenantId, name: "Analysis owner", email: "analysis-owner@example.test",
      passwordHash: "test-only-hash", role: "OWNER", status: "active"
    });
    userId = user._id;
    const contract = await Contract.create({
      _id: newId(), tenantId, title: "Report idempotency agreement",
      contractNumber: new Types.ObjectId().toString(), type: "NDA", status: "DRAFT",
      counterparty: "Report test counterparty", ownerId: userId, createdBy: userId,
      updatedBy: userId, currency: "USD", tags: [], latestVersion: 0
    });
    contractId = contract._id;
    jobId = newId();
    await DocumentProcessingJob.create({
      _id: jobId, tenantId, contractId, fileId: newId(), requestedBy: userId,
      role: "OWNER", engine: "RULE_BASED", status: "PROCESSING", attempts: 1,
      maxAttempts: 3, nextRunAt: new Date(), lockedAt: new Date(), lockedBy: "test-worker"
    });
  });

  afterEach(async () => {
    await Promise.all([
      ContractIntelligenceReport.deleteMany({}),
      DocumentProcessingJob.deleteMany({}),
      Contract.deleteMany({}),
      User.deleteMany({})
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  const analyze = () => analyzeContract(
    tenantId.toString(), userId.toString(), "OWNER", contractId.toString(),
    "This agreement contains confidentiality obligations, payment terms, limitation of liability, governing law, and data protection provisions. The parties agree to review these terms annually.",
    "agreement.pdf", "RULE_BASED", jobId.toString()
  );

  it("stores one report when a worker retries the same job after a prior report commit", async () => {
    const first = await analyze();
    const retry = await analyze();
    expect(retry.id).toBe(first.id);
    expect(await ContractIntelligenceReport.countDocuments({ jobId })).toBe(1);
  });

  it("does not call the AI provider again when the same job report already exists", async () => {
    const source = "This agreement contains confidentiality obligations, payment terms, limitation of liability, governing law, and data protection provisions. The parties agree to review these terms annually.";
    const first = await analyzeContract(
      tenantId.toString(), userId.toString(), "OWNER", contractId.toString(),
      source, "agreement.pdf", "AI_COMPATIBLE", jobId.toString()
    );
    const retry = await analyzeContract(
      tenantId.toString(), userId.toString(), "OWNER", contractId.toString(),
      source, "agreement.pdf", "AI_COMPATIBLE", jobId.toString()
    );
    expect(retry.id).toBe(first.id);
    expect(aiMock.analyzeWithConfiguredAI).toHaveBeenCalledTimes(1);
    expect(await ContractIntelligenceReport.countDocuments({ jobId })).toBe(1);
  });

  it("deduplicates concurrent report creation for the same job ID", async () => {
    const [first, second] = await Promise.all([analyze(), analyze()]);
    expect(first.id).toBe(second.id);
    expect(await ContractIntelligenceReport.countDocuments({ jobId })).toBe(1);
  });
});
