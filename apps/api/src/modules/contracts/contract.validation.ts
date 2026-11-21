import { z } from "zod";
import { CONTRACT_STATUSES, CONTRACT_TYPES } from "./contract.model.js";

const dateField = z.string().datetime({ offset: true }).optional().transform(value => value ? new Date(value) : undefined);
export const createContractSchema = z.object({
  title: z.string().trim().min(2).max(200),
  contractNumber: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9._/-]+$/),
  type: z.enum(CONTRACT_TYPES),
  counterparty: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000).optional(),
  ownerId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  startDate: dateField,
  endDate: dateField,
  currency: z.string().trim().length(3).default("USD").transform(value => value.toUpperCase()),
  contractValue: z.number().min(0).max(1_000_000_000_000).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).default([])
}).superRefine((value, ctx) => {
  if (value.startDate && value.endDate && value.endDate < value.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date." });
});
export const updateContractSchema = createContractSchema.partial().omit({ contractNumber: true }).extend({
  status: z.enum(CONTRACT_STATUSES).optional()
}).superRefine((value, ctx) => {
  if (value.startDate && value.endDate && value.endDate < value.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date." });
});
export const listContractsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  type: z.enum(CONTRACT_TYPES).optional(),
  counterparty: z.string().trim().max(160).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["createdAt", "updatedAt", "title", "endDate"]).default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc")
});
export const uploadIntentSchema = z.object({
  filename: z.string().trim().min(1).max(255).refine(value => !/[\\/\\0]/.test(value), "Filename must not contain path characters."),
  contentType: z.enum(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  sizeBytes: z.number().int().min(1).max(25 * 1024 * 1024)
});
