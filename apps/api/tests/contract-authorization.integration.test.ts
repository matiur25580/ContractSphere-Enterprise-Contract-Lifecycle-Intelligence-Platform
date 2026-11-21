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
import { updateContract } from "../src/modules/contracts/contract.service.js";
import { User } from "../src/modules/users/user.model.js";

const uri = process.env.MONGODB_URI?.replace(/\/[^/?]+(\?.*)?$/, "/contractsphere_contract_auth$1");
const newId = () => new Types.ObjectId();

describe.skipIf(!uri)("contract mutation authorization — MongoDB integration", () => {
  const tenantId = newId();
  const otherTenantId = newId();
  let ownerId: Types.ObjectId;
  let memberId: Types.ObjectId;
  let adminId: Types.ObjectId;
  let foreignOwnerId: Types.ObjectId;
  let ownedContractId: Types.ObjectId;
  let otherContractId: Types.ObjectId;

  beforeAll(async () => {
    await mongoose.connect(uri!);
    await Promise.all([User.syncIndexes(), Contract.syncIndexes()]);
  });

  beforeEach(async () => {
    const [owner, member, admin, foreignOwner] = await Promise.all([
      User.create({ _id: newId(), tenantId, name: "Owner", email: "owner-auth@example.test", passwordHash: "test-hash", role: "OWNER", status: "active" }),
      User.create({ _id: newId(), tenantId, name: "Member", email: "member-auth@example.test", passwordHash: "test-hash", role: "MEMBER", status: "active" }),
      User.create({ _id: newId(), tenantId, name: "Admin", email: "admin-auth@example.test", passwordHash: "test-hash", role: "ADMIN", status: "active" }),
      User.create({ _id: newId(), tenantId: otherTenantId, name: "Foreign owner", email: "foreign-owner-auth@example.test", passwordHash: "test-hash", role: "OWNER", status: "active" })
    ]);
    ownerId = owner._id;
    memberId = member._id;
    adminId = admin._id;
    foreignOwnerId = foreignOwner._id;

    const [owned, other] = await Promise.all([
      Contract.create({
        _id: newId(), tenantId, title: "Member-owned contract", contractNumber: "AUTH-" + newId(),
        type: "NDA", status: "DRAFT", counterparty: "Example A", ownerId: memberId,
        createdBy: memberId, updatedBy: memberId, currency: "USD", tags: [], latestVersion: 0
      }),
      Contract.create({
        _id: newId(), tenantId, title: "Owner contract", contractNumber: "AUTH-" + newId(),
        type: "NDA", status: "DRAFT", counterparty: "Example B", ownerId,
        createdBy: ownerId, updatedBy: ownerId, currency: "USD", tags: [], latestVersion: 0
      })
    ]);
    ownedContractId = owned._id;
    otherContractId = other._id;
  });

  afterEach(async () => {
    await Promise.all([Contract.deleteMany({}), User.deleteMany({})]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("allows a member to update a contract they own", async () => {
    const updated = await updateContract(tenantId.toString(), memberId.toString(), "MEMBER", ownedContractId.toString(), { description: "Updated by owner" });
    expect(updated.description).toBe("Updated by owner");
    expect(updated.updatedBy.toString()).toBe(memberId.toString());
  });

  it("denies a member from modifying another member's contract", async () => {
    await expect(updateContract(tenantId.toString(), memberId.toString(), "MEMBER", otherContractId.toString(), { description: "Unauthorized change" }))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect((await Contract.findById(otherContractId))?.description).toBeUndefined();
  });

  it("prevents a member from transferring ownership of their contract", async () => {
    await expect(updateContract(tenantId.toString(), memberId.toString(), "MEMBER", ownedContractId.toString(), { ownerId: ownerId.toString() }))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect((await Contract.findById(ownedContractId))?.ownerId.toString()).toBe(memberId.toString());
  });

  it("allows an administrator to update another member's contract", async () => {
    const updated = await updateContract(tenantId.toString(), adminId.toString(), "ADMIN", ownedContractId.toString(), { description: "Admin update" });
    expect(updated.description).toBe("Admin update");
  });

  it("allows an organization owner to update another member's contract", async () => {
    const updated = await updateContract(tenantId.toString(), ownerId.toString(), "OWNER", ownedContractId.toString(), { description: "Owner update" });
    expect(updated.description).toBe("Owner update");
  });

  it("hides a cross-tenant contract identifier from an authenticated owner", async () => {
    await expect(updateContract(otherTenantId.toString(), foreignOwnerId.toString(), "OWNER", ownedContractId.toString(), { description: "Cross-tenant change" }))
      .rejects.toMatchObject({ statusCode: 404, code: "CONTRACT_NOT_FOUND" });
  });
});
