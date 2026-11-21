import { z } from "zod";
import { VENDOR_CATEGORIES, VENDOR_RISK_LEVELS, VENDOR_STATUSES } from "./vendor.model.js";
const contact = z.object({ name: z.string().trim().min(2).max(100), title: z.string().trim().max(100).optional(), email: z.string().trim().email().max(254), phone: z.string().trim().max(40).optional(), primary: z.boolean().default(false) }).strict();
const certification = z.object({ name: z.string().trim().min(2).max(120), reference: z.string().trim().max(120).optional(), expiresAt: z.string().datetime({ offset: true }).transform(v => new Date(v)).optional(), status: z.enum(["VALID", "EXPIRED", "PENDING"]).default("PENDING") }).strict();
export const createVendorSchema = z.object({
 legalName: z.string().trim().min(2).max(180), displayName: z.string().trim().max(120).optional(),
 category: z.enum(VENDOR_CATEGORIES).default("SUPPLIER"), website: z.string().url().max(255).refine(value => value.startsWith("https://") || value.startsWith("http://"), "Website must use HTTP or HTTPS.").optional(),
 industry: z.string().trim().max(100).optional(), country: z.string().trim().max(100).optional(), taxId: z.string().trim().max(100).optional(),
 aliases: z.array(z.string().trim().min(2).max(180)).max(20).default([]), tags: z.array(z.string().trim().min(1).max(32)).max(30).default([]),
 contacts: z.array(contact).max(30).default([]), certifications: z.array(certification).max(50).default([])
}).strict();
export const updateVendorSchema = createVendorSchema.partial().extend({ status: z.enum(VENDOR_STATUSES).optional() }).strict().refine(v => Object.keys(v).length > 0);
export const listVendorsSchema = z.object({ q: z.string().trim().max(120).optional(), status: z.enum(VENDOR_STATUSES).optional(), category: z.enum(VENDOR_CATEGORIES).optional(), riskLevel: z.enum(VENDOR_RISK_LEVELS).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
export const assessVendorSchema = z.object({ score: z.number().int().min(0).max(100), factors: z.array(z.string().trim().min(2).max(160)).max(20).default([]), notes: z.string().trim().max(2000).optional() }).strict();
