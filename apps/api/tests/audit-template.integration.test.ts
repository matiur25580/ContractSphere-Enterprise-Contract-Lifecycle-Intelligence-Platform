import mongoose, { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditEvent } from "../src/modules/audit/audit.model.js";
import { listAuditEvents, recordAuditEvent } from "../src/modules/audit/audit.service.js";
import { ContractTemplate } from "../src/modules/templates/template.model.js";
import { approveTemplate, getTemplate, submitTemplate, updateTemplate } from "../src/modules/templates/template.service.js";
import { Tenant } from "../src/modules/tenants/tenant.model.js";
import { User } from "../src/modules/users/user.model.js";

const uri = process.env.MONGODB_URI?.replace(/\/[^/?]+(\?.*)?$/, "/contractsphere_audit_templates$1");
const newId = () => new Types.ObjectId();

describe.skipIf(!uri)("audit and template governance — MongoDB integration", () => {
  const tenantA = newId();
  const tenantB = newId();
  let ownerA: Types.ObjectId;
  let adminA: Types.ObjectId;
  let adminA2: Types.ObjectId;
  let ownerB: Types.ObjectId;

  beforeAll(async () => {
    await mongoose.connect(uri!);
    await Promise.all([
      Tenant.syncIndexes(),
      User.syncIndexes(),
      AuditEvent.syncIndexes(),
      ContractTemplate.syncIndexes()
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      Tenant.create({ _id: tenantA, name: "Audit tenant A", slug: "audit-a-" + newId().toString() }),
      Tenant.create({ _id: tenantB, name: "Audit tenant B", slug: "audit-b-" + newId().toString() })
    ]);
    const [aOwner, aAdmin, aAdmin2, bOwner] = await Promise.all([
      User.create({ _id: newId(), tenantId: tenantA, name: "Owner A", email: "owner-a@example.test", passwordHash: "test-hash", role: "OWNER", status: "active" }),
      User.create({ _id: newId(), tenantId: tenantA, name: "Admin A", email: "admin-a@example.test", passwordHash: "test-hash", role: "ADMIN", status: "active" }),
      User.create({ _id: newId(), tenantId: tenantA, name: "Admin A2", email: "admin-a2@example.test", passwordHash: "test-hash", role: "ADMIN", status: "active" }),
      User.create({ _id: newId(), tenantId: tenantB, name: "Owner B", email: "owner-b@example.test", passwordHash: "test-hash", role: "OWNER", status: "active" })
    ]);
    ownerA = aOwner._id;
    adminA = aAdmin._id;
    adminA2 = aAdmin2._id;
    ownerB = bOwner._id;
  });

  afterEach(async () => {
    await Promise.all([
      AuditEvent.deleteMany({}),
      ContractTemplate.deleteMany({}),
      User.deleteMany({}),
      Tenant.deleteMany({})
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  async function createTemplate(tenantId: Types.ObjectId, creatorId: Types.ObjectId, name = "Master services agreement") {
    return ContractTemplate.create({
      _id: newId(), tenantId, name, contractType: "MSA", version: 1,
      status: "DRAFT", fields: [], sections: [], createdBy: creatorId, updatedBy: creatorId
    });
  }

  it("lists audit events only for the requested tenant", async () => {
    await Promise.all([
      recordAuditEvent({ tenantId: tenantA.toString(), actorId: ownerA.toString(), action: "CONTRACT_CREATED", resourceType: "CONTRACT", resourceId: "contract-a", summary: "Tenant A event" }),
      recordAuditEvent({ tenantId: tenantB.toString(), actorId: ownerB.toString(), action: "CONTRACT_CREATED", resourceType: "CONTRACT", resourceId: "contract-b", summary: "Tenant B event" })
    ]);
    const result = await listAuditEvents(tenantA.toString(), { page: 1, limit: 25 });
    expect(result.pagination.total).toBe(1);
    expect(result.items[0]?.resourceId).toBe("contract-a");
    expect(result.items.some(item => item.tenantId.toString() === tenantB.toString())).toBe(false);
  });

  it("prevents template self-approval and cross-tenant template access", async () => {
    const template = await createTemplate(tenantA, ownerA);
    await submitTemplate(tenantA.toString(), template.id);
    await expect(approveTemplate(tenantA.toString(), ownerA.toString(), template.id))
      .rejects.toMatchObject({ statusCode: 403, code: "SELF_APPROVAL_FORBIDDEN" });
    await expect(getTemplate(tenantB.toString(), template.id))
      .rejects.toMatchObject({ statusCode: 404, code: "TEMPLATE_NOT_FOUND" });
    expect((await ContractTemplate.findById(template._id))?.status).toBe("PENDING_APPROVAL");
  });

  it("rejects a valid approver identity from a different tenant", async () => {
    const template = await createTemplate(tenantA, ownerA);
    await submitTemplate(tenantA.toString(), template.id);
    await expect(approveTemplate(tenantA.toString(), ownerB.toString(), template.id))
      .rejects.toMatchObject({ statusCode: 403, code: "INVALID_TEMPLATE_APPROVER" });
    expect((await ContractTemplate.findById(template._id))?.status).toBe("PENDING_APPROVAL");
    await expect(approveTemplate(tenantA.toString(), adminA.toString(), template.id))
      .resolves.toMatchObject({ status: "APPROVED" });
  });

  it("atomically approves a pending template and rejects a competing approval", async () => {
    const template = await createTemplate(tenantA, ownerA);
    await submitTemplate(tenantA.toString(), template.id);
    const outcomes = await Promise.allSettled([
      approveTemplate(tenantA.toString(), adminA.toString(), template.id),
      approveTemplate(tenantA.toString(), adminA2.toString(), template.id)
    ]);
    const successes = outcomes.filter(item => item.status === "fulfilled");
    expect(successes).toHaveLength(1);
    expect((await ContractTemplate.findById(template._id))?.status).toBe("APPROVED");
    expect(outcomes.filter(item => item.status === "rejected")).toHaveLength(1);
  });

  it("allows edits only while a template is a tenant-owned draft", async () => {
    const template = await createTemplate(tenantA, ownerA, "Draft template");
    const updated = await updateTemplate(tenantA.toString(), ownerA.toString(), template.id, {
      name: "Updated draft", contractType: "MSA", fields: [], sections: []
    });
    expect(updated.name).toBe("Updated draft");
    await submitTemplate(tenantA.toString(), template.id);
    await expect(updateTemplate(tenantA.toString(), ownerA.toString(), template.id, {
      name: "Late edit", contractType: "MSA", fields: [], sections: []
    })).rejects.toMatchObject({ statusCode: 409, code: "TEMPLATE_STATE_CONFLICT" });
    await expect(updateTemplate(tenantB.toString(), ownerB.toString(), template.id, {
      name: "Cross tenant edit", contractType: "MSA", fields: [], sections: []
    })).rejects.toMatchObject({ statusCode: 409, code: "TEMPLATE_STATE_CONFLICT" });
  });
});
