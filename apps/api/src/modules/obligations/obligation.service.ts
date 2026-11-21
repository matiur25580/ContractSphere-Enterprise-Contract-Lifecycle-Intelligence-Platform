import { Types } from "mongoose";
import { HttpError } from "../../common/http-error.js";
import { Contract } from "../contracts/contract.model.js";
import { User } from "../users/user.model.js";
import { Obligation } from "./obligation.model.js";
import { Renewal } from "./renewal.model.js";

const oid = (value: string) => new Types.ObjectId(value);
const canManage = (role: string, userId: string, ownerId: unknown) => role === "OWNER" || role === "ADMIN" || String(ownerId) === userId;
async function activeOwner(tenant: Types.ObjectId, ownerId: string) {
  if (!await User.exists({ _id: oid(ownerId), tenantId: tenant, status: "active" })) throw new HttpError(400, "Owner must be an active member of this organization.", "INVALID_OWNER");
  return oid(ownerId);
}
async function accessibleContract(tenant: Types.ObjectId, contractId: string, userId: string, role: string) {
  const contract = await Contract.findOne({ _id: contractId, tenantId: tenant, status: { $ne: "ARCHIVED" } }).select("_id ownerId endDate").lean();
  if (!contract) throw new HttpError(404, "Contract not found.", "CONTRACT_NOT_FOUND");
  if (!canManage(role, userId, contract.ownerId)) throw new HttpError(403, "Only the contract owner or an organization administrator can manage its obligations and renewal.", "FORBIDDEN");
  return contract;
}
function refreshObligationStatus(status: string, dueDate: Date, now = new Date()) {
  if (status === "COMPLETED" || status === "CANCELLED") return status;
  return dueDate.getTime() < now.getTime() ? "OVERDUE" : status === "OVERDUE" ? "PENDING" : status;
}
function renewalStatus(expiryDate: Date, noticeDeadline: Date, renewalType: string, current: string | undefined, now = new Date()) {
  if (["RENEWED", "TERMINATED", "RENEWAL_IN_PROGRESS"].includes(current ?? "")) return current!;
  if (expiryDate.getTime() < now.getTime()) return "EXPIRED";
  if (renewalType !== "NONE" && noticeDeadline.getTime() <= now.getTime()) return "NOTICE_DUE";
  return "UPCOMING";
}
export { refreshObligationStatus, renewalStatus };

export async function createObligation(tenantId: string, userId: string, role: string, input: any) {
  const tenant = oid(tenantId);
  await accessibleContract(tenant, input.contractId, userId, role);
  const ownerId = await activeOwner(tenant, input.ownerId ?? userId);
  return Obligation.create({ ...input, tenantId: tenant, ownerId, createdBy: oid(userId), updatedBy: oid(userId) });
}
export async function listObligations(tenantId: string, query: any) {
  const tenant = oid(tenantId), filter: Record<string, any> = { tenantId: tenant };
  for (const key of ["contractId", "ownerId", "type", "priority"] as const) if (query[key]) filter[key] = ["contractId", "ownerId"].includes(key) ? oid(query[key]) : query[key];
  if (query.status === "OVERDUE") { filter.dueDate = { $lt: new Date() }; filter.status = { $nin: ["COMPLETED", "CANCELLED"] }; }
  else if (query.status === "PENDING" || query.status === "IN_PROGRESS") { filter.status = query.status; filter.dueDate = { $gte: new Date() }; }
  else if (query.status) filter.status = query.status;
  if (query.dueFrom || query.dueTo) filter.dueDate = { ...((filter.dueDate as Record<string, Date> | undefined) ?? {}), ...(query.dueFrom ? { $gte: query.dueFrom } : {}), ...(query.dueTo ? { $lte: query.dueTo } : {}) };
  const [items, total] = await Promise.all([
    Obligation.find(filter).sort({ dueDate: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).populate("contractId", "title contractNumber counterparty").populate("ownerId", "name email").lean(),
    Obligation.countDocuments(filter)
  ]);
  return { items: items.map(item => ({ ...item, status: refreshObligationStatus(item.status, item.dueDate) })), pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}
export async function updateObligation(tenantId: string, userId: string, role: string, obligationId: string, changes: any) {
  const tenant = oid(tenantId);
  const existing = await Obligation.findOne({ _id: obligationId, tenantId: tenant });
  if (!existing) throw new HttpError(404, "Obligation not found.", "OBLIGATION_NOT_FOUND");
  if (!canManage(role, userId, existing.ownerId)) throw new HttpError(403, "Only the obligation owner or an organization administrator can update it.", "FORBIDDEN");
  if (changes.ownerId) changes.ownerId = await activeOwner(tenant, changes.ownerId);
  if (changes.status === "COMPLETED") changes.completedAt = new Date();
  else if (changes.status === "PENDING" || changes.status === "IN_PROGRESS") changes.completedAt = undefined;
  const updated = await Obligation.findOneAndUpdate({ _id: obligationId, tenantId: tenant }, { $set: { ...changes, updatedBy: oid(userId) } }, { new: true, runValidators: true });
  return updated;
}
export async function listRenewals(tenantId: string, query: { status?: string; page: number; limit: number }) {
  const tenant = oid(tenantId), filter: Record<string, unknown> = { tenantId: tenant };
  const docs = await Renewal.find(filter).sort({ noticeDeadline: 1 }).populate("contractId", "title contractNumber counterparty").populate("ownerId", "name email").lean();
  const items = docs.map(item => ({ ...item, status: renewalStatus(item.expiryDate, item.noticeDeadline, item.renewalType, item.status) })).filter(item => !query.status || item.status === query.status);
  const total = items.length, start = (query.page - 1) * query.limit;
  return { items: items.slice(start, start + query.limit), summary: { upcoming: items.filter(x => x.status === "UPCOMING").length, noticeDue: items.filter(x => x.status === "NOTICE_DUE").length, inProgress: items.filter(x => x.status === "RENEWAL_IN_PROGRESS").length, expired: items.filter(x => x.status === "EXPIRED").length }, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}
export async function upsertRenewal(tenantId: string, userId: string, role: string, contractId: string, input: any) {
  const tenant = oid(tenantId);
  const contract = await accessibleContract(tenant, contractId, userId, role);
  const ownerId = await activeOwner(tenant, input.ownerId ?? userId);
  const expiryDate: Date = input.expiryDate;
  const noticeDeadline = new Date(expiryDate.getTime() - input.noticePeriodDays * 86400000);
  const existing = await Renewal.findOne({ tenantId: tenant, contractId: contract._id }).lean();
  const status = renewalStatus(expiryDate, noticeDeadline, input.renewalType, existing?.status);
  return Renewal.findOneAndUpdate(
    { tenantId: tenant, contractId: contract._id },
    { $set: { ...input, tenantId: tenant, contractId: contract._id, ownerId, expiryDate, noticeDeadline, status, updatedBy: oid(userId) }, $setOnInsert: { createdBy: oid(userId) } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}
export async function changeRenewalStatus(tenantId: string, userId: string, role: string, renewalId: string, status: string) {
  const tenant = oid(tenantId);
  const renewal = await Renewal.findOne({ _id: renewalId, tenantId: tenant });
  if (!renewal) throw new HttpError(404, "Renewal not found.", "RENEWAL_NOT_FOUND");
  if (!canManage(role, userId, renewal.ownerId)) throw new HttpError(403, "Only the renewal owner or an organization administrator can update it.", "FORBIDDEN");
  renewal.status = status as any; renewal.updatedBy = oid(userId);
  await renewal.save();
  return renewal;
}
