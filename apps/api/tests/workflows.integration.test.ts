import mongoose, { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { HttpError } from "../src/common/http-error.js";
import { Contract } from "../src/modules/contracts/contract.model.js";
import { User } from "../src/modules/users/user.model.js";
import { WorkflowDefinition, WorkflowInstance } from "../src/modules/workflows/workflow.model.js";
import { decideOnWorkflow, submitContractForApproval } from "../src/modules/workflows/workflow.service.js";

const uri = process.env.MONGODB_URI;
const newId = () => new Types.ObjectId();

describe.skipIf(!uri)("workflow service — MongoDB integration", () => {
  const tenantId = newId();
  const otherTenantId = newId();
  let ownerId: Types.ObjectId;
  let approverA: Types.ObjectId;
  let approverB: Types.ObjectId;

  beforeAll(async () => {
    await mongoose.connect(uri!);
    await Promise.all([
      User.syncIndexes(),
      Contract.syncIndexes(),
      WorkflowDefinition.syncIndexes(),
      WorkflowInstance.syncIndexes()
    ]);
  });

  afterEach(async () => {
    await Promise.all([
      WorkflowInstance.deleteMany({}),
      WorkflowDefinition.deleteMany({}),
      Contract.deleteMany({}),
      User.deleteMany({})
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  async function createUser(tenant: Types.ObjectId, email: string, role: "OWNER" | "ADMIN" | "MEMBER" = "MEMBER") {
    return User.create({
      _id: newId(), tenantId: tenant, name: email, email,
      passwordHash: "test-only-hash", role, status: "active"
    });
  }

  async function createContract(owner: Types.ObjectId, tenant = tenantId) {
    return Contract.create({
      _id: newId(), tenantId: tenant, title: "Integration test agreement",
      contractNumber: new Types.ObjectId().toString(), type: "NDA", status: "DRAFT",
      counterparty: "Example Counterparty", ownerId: owner, createdBy: owner,
      updatedBy: owner, currency: "USD", tags: [], latestVersion: 0
    });
  }

  async function createDefinition(approvers: Types.ObjectId[], approvalMode: "ALL" | "ANY" = "ALL", tenant = tenantId) {
    return WorkflowDefinition.create({
      _id: newId(), tenantId: tenant, name: "Integration approval " + new Types.ObjectId().toString(),
      stages: [{ name: "Review", approvalMode, approverUserIds: approvers }],
      isActive: true, createdBy: ownerId
    });
  }

  beforeAll(async () => {
    const owner = await createUser(tenantId, "workflow-owner@example.test", "OWNER");
    ownerId = owner._id;
    approverA = (await createUser(tenantId, "approver-a@example.test"))._id;
    approverB = (await createUser(tenantId, "approver-b@example.test"))._id;
  });

  it("moves a contract through IN_REVIEW to APPROVED after every ALL approver approves", async () => {
    const contract = await createContract(ownerId);
    const definition = await createDefinition([approverA, approverB], "ALL");
    const instance = await submitContractForApproval(tenantId.toString(), ownerId.toString(), "OWNER", contract.id, definition.id);

    const first = await decideOnWorkflow(tenantId.toString(), approverA.toString(), instance.id, { decision: "APPROVE" });
    expect(first.status).toBe("IN_PROGRESS");
    expect((await Contract.findById(contract._id))?.status).toBe("IN_REVIEW");

    const final = await decideOnWorkflow(tenantId.toString(), approverB.toString(), instance.id, { decision: "APPROVE" });
    expect(final.status).toBe("APPROVED");
    expect(final.active).toBe(false);
    expect((await Contract.findById(contract._id))?.status).toBe("APPROVED");
  });

  it("rejects a member attempting to submit another member's contract", async () => {
    const contract = await createContract(ownerId);
    const member = await createUser(tenantId, "unrelated-member@example.test");
    const definition = await createDefinition([approverA], "ANY");
    await expect(submitContractForApproval(tenantId.toString(), member.id, "MEMBER", contract.id, definition.id))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(await WorkflowInstance.countDocuments({ contractId: contract._id })).toBe(0);
    expect((await Contract.findById(contract._id))?.status).toBe("DRAFT");
  });

  it("does not expose another tenant's workflow instance to a decision request", async () => {
    const contract = await createContract(ownerId);
    const definition = await createDefinition([approverA], "ANY");
    const instance = await submitContractForApproval(tenantId.toString(), ownerId.toString(), "OWNER", contract.id, definition.id);
    await expect(decideOnWorkflow(otherTenantId.toString(), approverA.toString(), instance.id, { decision: "APPROVE" }))
      .rejects.toMatchObject({ statusCode: 404, code: "WORKFLOW_TASK_NOT_FOUND" });
    expect((await WorkflowInstance.findById(instance._id))?.status).toBe("IN_PROGRESS");
  });

  it("records only one decision when the same approver submits concurrently", async () => {
    const contract = await createContract(ownerId);
    const definition = await createDefinition([approverA], "ANY");
    const instance = await submitContractForApproval(tenantId.toString(), ownerId.toString(), "OWNER", contract.id, definition.id);
    const results = await Promise.allSettled([
      decideOnWorkflow(tenantId.toString(), approverA.toString(), instance.id, { decision: "APPROVE" }),
      decideOnWorkflow(tenantId.toString(), approverA.toString(), instance.id, { decision: "APPROVE" })
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const stored = await WorkflowInstance.findById(instance._id).lean();
    expect(stored?.stages[0]?.decisions).toHaveLength(1);
    expect(stored?.status).toBe("APPROVED");
    expect((await Contract.findById(contract._id))?.status).toBe("APPROVED");
    const rejected = results.find(result => result.status === "rejected");
    expect(rejected && rejected.status === "rejected" && rejected.reason).toBeInstanceOf(HttpError);
  });

  it("rejects an assigned approval and returns the contract to DRAFT", async () => {
    const contract = await createContract(ownerId);
    const definition = await createDefinition([approverA], "ANY");
    const instance = await submitContractForApproval(tenantId.toString(), ownerId.toString(), "OWNER", contract.id, definition.id);
    const rejected = await decideOnWorkflow(tenantId.toString(), approverA.toString(), instance.id, { decision: "REJECT", comment: "Needs revision" });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.active).toBe(false);
    expect((await Contract.findById(contract._id))?.status).toBe("DRAFT");
  });
});
