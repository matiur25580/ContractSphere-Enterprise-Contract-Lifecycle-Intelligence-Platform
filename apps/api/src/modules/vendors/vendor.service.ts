import { Types } from "mongoose";
import { HttpError } from "../../common/http-error.js";
import { Contract } from "../contracts/contract.model.js";
import { Obligation } from "../obligations/obligation.model.js";
import { Renewal } from "../obligations/renewal.model.js";
import { Vendor } from "./vendor.model.js";

const oid = (value: string) => new Types.ObjectId(value);
const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function riskLevel(score: number) { return score >= 80 ? "CRITICAL" : score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW"; }
function certificationState(cert: { status: string; expiresAt?: Date }, now = new Date()) { return cert.expiresAt && cert.expiresAt.getTime() < now.getTime() ? "EXPIRED" : cert.status; }

export async function createVendor(tenantId: string, userId: string, input: any) {
 const tenant = oid(tenantId), normalizedName = normalize(input.legalName);
 try { return await Vendor.create({ ...input, tenantId: tenant, normalizedName, aliases: input.aliases.map((x: string) => normalize(x)), createdBy: oid(userId), updatedBy: oid(userId) }); }
 catch (error) { if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new HttpError(409, "A vendor with this legal name already exists in your organization.", "VENDOR_EXISTS"); throw error; }
}
export async function listVendors(tenantId: string, query: any) {
 const tenant = oid(tenantId), filter: Record<string, any> = { tenantId: tenant };
 if (query.status) filter.status = query.status;
 if (query.category) filter.category = query.category;
 if (query.riskLevel) filter.riskLevel = query.riskLevel;
 if (query.q) filter.$text = { $search: query.q };
 const [items, total] = await Promise.all([
  Vendor.find(filter).sort({ updatedAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
  Vendor.countDocuments(filter)
 ]);
 return { items: items.map(v => ({ ...v, certifications: v.certifications.map(c => ({ ...c, status: certificationState(c) })) })), pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}
export async function updateVendor(tenantId: string, userId: string, vendorId: string, changes: any) {
 const tenant = oid(tenantId), vendor = await Vendor.findOne({ _id: vendorId, tenantId: tenant });
 if (!vendor) throw new HttpError(404, "Vendor not found.", "VENDOR_NOT_FOUND");
 const update = { ...changes, ...(changes.legalName ? { normalizedName: normalize(changes.legalName) } : {}), ...(changes.aliases ? { aliases: changes.aliases.map(normalize) } : {}), updatedBy: oid(userId) };
 try { const saved = await Vendor.findOneAndUpdate({ _id: vendorId, tenantId: tenant }, { $set: update }, { new: true, runValidators: true }); return saved; }
 catch (error) { if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new HttpError(409, "A vendor with this legal name already exists.", "VENDOR_EXISTS"); throw error; }
}
export async function assessVendor(tenantId: string, userId: string, vendorId: string, input: any) {
 const tenant = oid(tenantId), level = riskLevel(input.score), now = new Date();
 const vendor = await Vendor.findOneAndUpdate({ _id: vendorId, tenantId: tenant }, { $set: { riskScore: input.score, riskLevel: level, riskFactors: input.factors, lastAssessedAt: now, updatedBy: oid(userId) }, $push: { assessmentHistory: { score: input.score, level, factors: input.factors, notes: input.notes, assessedBy: oid(userId), assessedAt: now } } }, { new: true, runValidators: true });
 if (!vendor) throw new HttpError(404, "Vendor not found.", "VENDOR_NOT_FOUND");
 return vendor;
}
export async function getVendorOverview(tenantId: string, vendorId: string) {
 const tenant = oid(tenantId), vendor = await Vendor.findOne({ _id: vendorId, tenantId: tenant }).lean();
 if (!vendor) throw new HttpError(404, "Vendor not found.", "VENDOR_NOT_FOUND");
 const names = [vendor.legalName, vendor.displayName, ...vendor.aliases].filter((name): name is string => typeof name === "string" && name.length > 0).map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
 const contracts = await Contract.find({ tenantId: tenant, $or: [{ vendorId: vendor._id }, { counterparty: { $in: names.map(name => new RegExp("^" + name + "$", "i")) } }] }).select("_id title contractNumber type status contractValue currency endDate").lean();
 const contractIds = contracts.map(c => c._id);
 const [obligations, renewals] = await Promise.all([
  Obligation.aggregate([{ $match: { tenantId: tenant, contractId: { $in: contractIds } } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
  Renewal.find({ tenantId: tenant, contractId: { $in: contractIds } }).select("status expiryDate noticeDeadline").lean()
 ]);
 return { vendor, contracts, contractCount: contracts.length, totalContractValue: contracts.reduce((sum, c) => sum + (c.contractValue ?? 0), 0), obligations, renewals, compliance: vendor.certifications.map(c => ({ ...c, status: certificationState(c) })) };
}
