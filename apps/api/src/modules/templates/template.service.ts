import { Types } from "mongoose";
import { HttpError } from "../../common/http-error.js";
import { User } from "../users/user.model.js";
import { createContract } from "../contracts/contract.service.js";
import { Clause } from "./clause.model.js";
import { ContractTemplate } from "./template.model.js";
const oid = (id: string) => new Types.ObjectId(id);
export async function listTemplates(tenantId: string) {
 return ContractTemplate.find({ tenantId: oid(tenantId), status: { $ne: "RETIRED" } }).sort({ updatedAt: -1 }).lean();
}
export async function getTemplate(tenantId: string, templateId: string) {
 const template = await ContractTemplate.findOne({ _id: templateId, tenantId: oid(tenantId) }).lean();
 if (!template) throw new HttpError(404, "Template not found.", "TEMPLATE_NOT_FOUND");
 return template;
}
export async function createTemplate(tenantId: string, userId: string, input: Record<string, any>) {
 await validateClauseReferences(tenantId, input.sections);
 return ContractTemplate.create({ ...input, tenantId: oid(tenantId), createdBy: oid(userId), updatedBy: oid(userId) });
}
export async function updateTemplate(tenantId: string, userId: string, templateId: string, input: Record<string, any>) {
 await validateClauseReferences(tenantId, input.sections);
 const template = await ContractTemplate.findOneAndUpdate(
  { _id: templateId, tenantId: oid(tenantId), status: "DRAFT" },
  { $set: { ...input, updatedBy: oid(userId) } },
  { new: true, runValidators: true }
 );
 if (!template) throw new HttpError(409, "The template is no longer a draft. Refresh before editing.", "TEMPLATE_STATE_CONFLICT");
 return template;
}
export async function submitTemplate(tenantId: string, templateId: string) {
 const template = await ContractTemplate.findOneAndUpdate({ _id: templateId, tenantId: oid(tenantId), status: "DRAFT" }, { $set: { status: "PENDING_APPROVAL", submittedAt: new Date() } }, { new: true });
 if (!template) throw new HttpError(404, "Draft template not found.", "TEMPLATE_NOT_FOUND");
 return template;
}
export async function approveTemplate(tenantId: string, approverId: string, templateId: string) {
 const pending = await ContractTemplate.findOne({ _id: templateId, tenantId: oid(tenantId), status: "PENDING_APPROVAL" }).select("createdBy").lean();
 if (!pending) throw new HttpError(404, "Pending template not found.", "TEMPLATE_NOT_FOUND");
 const approver = await User.findOne({
  _id: oid(approverId), tenantId: oid(tenantId), status: "active", role: { $in: ["OWNER", "ADMIN"] }
 }).select("_id").lean();
 if (!approver) throw new HttpError(403, "An active owner or administrator from this organization must approve the template.", "INVALID_TEMPLATE_APPROVER");
 if (pending.createdBy.toString() === approverId) throw new HttpError(403, "A different owner or administrator must approve this template.", "SELF_APPROVAL_FORBIDDEN");
 const template = await ContractTemplate.findOneAndUpdate(
  { _id: templateId, tenantId: oid(tenantId), status: "PENDING_APPROVAL", createdBy: { $ne: oid(approverId) } },
  { $set: { status: "APPROVED", approvedAt: new Date(), approvedBy: oid(approverId), updatedBy: oid(approverId) } },
  { new: true, runValidators: true }
 );
 if (!template) throw new HttpError(409, "The template approval state changed. Refresh and try again.", "TEMPLATE_STATE_CONFLICT");
 return template;
}
export async function createTemplateRevision(tenantId: string, userId: string, templateId: string) {
 const source = await ContractTemplate.findOne({ _id: templateId, tenantId: oid(tenantId), status: "APPROVED" }).lean();
 if (!source) throw new HttpError(404, "Approved template not found.", "TEMPLATE_NOT_FOUND");
 const rootId = source.basedOnTemplateId ?? source._id;
 const latest = await ContractTemplate.findOne({ tenantId: oid(tenantId), $or: [{ _id: rootId }, { basedOnTemplateId: rootId }] }).sort({ version: -1 }).lean();
 const version = Math.max(source.version, latest?.version ?? 0) + 1;
 return ContractTemplate.create({
  tenantId: oid(tenantId), name: source.name, description: source.description, contractType: source.contractType,
  version, status: "DRAFT", fields: source.fields, sections: source.sections, createdBy: oid(userId), updatedBy: oid(userId), basedOnTemplateId: rootId
 });
}
export async function listClauses(tenantId: string) {
 return Clause.find({ tenantId: oid(tenantId), status: "ACTIVE" }).sort({ category: 1, title: 1 }).lean();
}
export async function createClause(tenantId: string, userId: string, input: Record<string, any>) {
 try {
  return await Clause.create({ ...input, tenantId: oid(tenantId), createdBy: oid(userId), updatedBy: oid(userId), versions: [{ version: 1, body: input.body, createdBy: oid(userId), createdAt: new Date() }] });
 } catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new HttpError(409, "A clause with this key already exists in your organization.", "CLAUSE_KEY_EXISTS");
  throw error;
 }
}
export async function updateClause(tenantId: string, userId: string, clauseId: string, changes: Record<string, any>) {
 const clause = await Clause.findOne({ _id: clauseId, tenantId: oid(tenantId), status: "ACTIVE" });
 if (!clause) throw new HttpError(404, "Active clause not found.", "CLAUSE_NOT_FOUND");
 if (changes.body && changes.body !== clause.body) {
  clause.version += 1;
  clause.versions.push({ version: clause.version, body: changes.body, createdBy: oid(userId), createdAt: new Date() });
 }
 Object.assign(clause, changes, { updatedBy: oid(userId) });
 await clause.save();
 return clause;
}
async function validateClauseReferences(tenantId: string, sections: Array<{ clauseId?: string; clauseVersion?: number }>) {
 for (const section of sections) {
  if (!section.clauseId) continue;
  const clause = await Clause.findOne({ _id: section.clauseId, tenantId: oid(tenantId), status: "ACTIVE" }).lean();
  if (!clause) throw new HttpError(400, "Template clauses must belong to this organization and be active.", "INVALID_TEMPLATE_CLAUSE");
  const version = section.clauseVersion ?? clause.version;
  section.clauseVersion = version;
  if (!(clause.versions as any[]).some(entry => entry.version === version)) throw new HttpError(400, "The referenced clause version does not exist.", "INVALID_CLAUSE_VERSION");
 }
}
export async function generateContractFromTemplate(tenantId: string, userId: string, templateId: string, input: Record<string, any>) {
 const template = await ContractTemplate.findOne({ _id: templateId, tenantId: oid(tenantId), status: "APPROVED" }).lean();
 if (!template) throw new HttpError(404, "Approved template not found.", "TEMPLATE_NOT_FOUND");
 const definitions = new Map<string, any>(template.fields.map((field: any) => [field.key as string, field]));
 for (const [key, spec] of definitions) {
  const value = input.values[key];
  if (value === undefined || value === null || value === "") {
   if (spec.required) throw new HttpError(400, `Missing required template field: ${spec.label}`, "TEMPLATE_FIELD_REQUIRED");
   continue;
  }
  if (spec.type === "TEXT" && typeof value !== "string") throw new HttpError(400, `Field ${spec.label} must be text.`, "INVALID_TEMPLATE_FIELD");
  if (spec.type === "EMAIL" && (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) throw new HttpError(400, `Field ${spec.label} must be an email.`, "INVALID_TEMPLATE_FIELD");
  if (spec.type === "DATE" && (typeof value !== "string" || Number.isNaN(Date.parse(value)))) throw new HttpError(400, `Field ${spec.label} must be a date.`, "INVALID_TEMPLATE_FIELD");
  if (spec.type === "NUMBER" && typeof value !== "number") throw new HttpError(400, `Field ${spec.label} must be a number.`, "INVALID_TEMPLATE_FIELD");
  if (spec.type === "CHOICE" && (typeof value !== "string" || !spec.options.includes(value))) throw new HttpError(400, `Field ${spec.label} must be one of the configured options.`, "INVALID_TEMPLATE_FIELD");
 }
 for (const key of Object.keys(input.values)) if (!definitions.has(key)) throw new HttpError(400, `Unknown template field: ${key}`, "UNKNOWN_TEMPLATE_FIELD");
 const rendered: string[] = [];
 for (const section of template.sections as any[]) {
  if (section.optional && [...section.content.matchAll(/{{\s*([a-z][a-zA-Z0-9_]*)\s*}}/g)].some(match => input.values[match[1]!] === undefined || input.values[match[1]!] === null || input.values[match[1]!] === "")) continue;
  let body = section.content;
  if (section.clauseId) {
   const clause = await Clause.findOne({ _id: section.clauseId, tenantId: oid(tenantId), status: "ACTIVE" }).lean();
   if (!clause) throw new HttpError(400, "A referenced clause is no longer active.", "INVALID_TEMPLATE_CLAUSE");
   const version = section.clauseVersion ?? clause.version;
   const snapshot = (clause.versions as any[]).find(entry => entry.version === version);
   if (!snapshot) throw new HttpError(400, "A referenced clause version is unavailable.", "INVALID_CLAUSE_VERSION");
   body = snapshot.body;
  }
  body = body.replace(/{{\s*([a-z][a-zA-Z0-9_]*)\s*}}/g, (_match: string, key: string) => String(input.values[key] ?? ""));
  rendered.push(`${section.heading}\n${body}`);
 }
 const draftContent = [template.name, `Template version: ${template.version}`, ...rendered].join("\n\n");
 const contract = await createContract(tenantId, userId, {
  title: template.name, contractNumber: input.contractNumber, type: template.contractType, counterparty: input.counterparty,
  ownerId: input.ownerId, vendorId: input.vendorId, startDate: input.startDate ? new Date(input.startDate) : undefined,
  endDate: input.endDate ? new Date(input.endDate) : undefined, currency: input.currency, contractValue: input.contractValue,
  tags: ["generated-from-template"], generatedDraftContent: draftContent, sourceTemplateId: template._id, sourceTemplateVersion: template.version
 });
 return { contract, draftContent, templateVersion: template.version };
}
