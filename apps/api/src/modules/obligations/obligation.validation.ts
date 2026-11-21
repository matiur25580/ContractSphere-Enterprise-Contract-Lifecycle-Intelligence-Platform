import { z } from "zod";
import { OBLIGATION_PRIORITIES, OBLIGATION_STATUSES, OBLIGATION_TYPES } from "./obligation.model.js";
import { RENEWAL_TYPES } from "./renewal.model.js";
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const date = z.string().datetime({ offset: true }).transform(value => new Date(value));
export const createObligationSchema = z.object({
  contractId: objectId, title: z.string().trim().min(2).max(180), description: z.string().trim().max(2000).optional(),
  type: z.enum(OBLIGATION_TYPES), priority: z.enum(OBLIGATION_PRIORITIES).default("MEDIUM"),
  ownerId: objectId.optional(), dueDate: date, amount: z.number().min(0).max(1_000_000_000_000).optional(),
  currency: z.string().trim().length(3).transform(value => value.toUpperCase()).optional()
}).strict();
export const updateObligationSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(), description: z.string().trim().max(2000).optional(),
  type: z.enum(OBLIGATION_TYPES).optional(), priority: z.enum(OBLIGATION_PRIORITIES).optional(),
  ownerId: objectId.optional(), dueDate: date.optional(), amount: z.number().min(0).max(1_000_000_000_000).optional(),
  currency: z.string().trim().length(3).transform(value => value.toUpperCase()).optional(),
  status: z.enum(OBLIGATION_STATUSES).optional()
}).strict().refine(value => Object.keys(value).length > 0);
export const listObligationsSchema = z.object({
  contractId: objectId.optional(), ownerId: objectId.optional(), status: z.enum(OBLIGATION_STATUSES).optional(),
  type: z.enum(OBLIGATION_TYPES).optional(), priority: z.enum(OBLIGATION_PRIORITIES).optional(),
  dueFrom: date.optional(), dueTo: date.optional(),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20)
}).refine(value => !value.dueFrom || !value.dueTo || value.dueFrom <= value.dueTo, { path: ["dueTo"], message: "dueTo must be on or after dueFrom." });
export const upsertRenewalSchema = z.object({
  expiryDate: date, noticePeriodDays: z.number().int().min(0).max(3650),
  renewalType: z.enum(RENEWAL_TYPES), ownerId: objectId.optional(), notes: z.string().trim().max(2000).optional()
}).strict();
export const updateRenewalStatusSchema = z.object({
  status: z.enum(["RENEWAL_IN_PROGRESS", "RENEWED", "TERMINATED"])
}).strict();
