import { z } from "zod";
import { CONTRACT_TYPES } from "../contracts/contract.model.js";
const fieldSchema = z.object({
 key: z.string().regex(/^[a-z][a-zA-Z0-9_]{1,39}$/), label: z.string().trim().min(2).max(100),
 type: z.enum(["TEXT", "DATE", "NUMBER", "EMAIL", "CHOICE"]), required: z.boolean().default(true),
 options: z.array(z.string().trim().min(1).max(100)).max(30).default([])
}).strict().superRefine((field, ctx) => {
 if (field.type === "CHOICE" && !field.options.length) ctx.addIssue({ code: "custom", path: ["options"], message: "Choice fields require options." });
 if (field.type !== "CHOICE" && field.options.length) ctx.addIssue({ code: "custom", path: ["options"], message: "Only choice fields accept options." });
});
const sectionSchema = z.object({
 heading: z.string().trim().min(2).max(160), content: z.string().trim().min(1).max(20000),
 clauseId: z.string().regex(/^[a-f\d]{24}$/i).optional(), clauseVersion: z.number().int().min(1).optional(), optional: z.boolean().default(false)
}).strict().superRefine((section, ctx) => {
 if (section.clauseVersion && !section.clauseId) ctx.addIssue({ code: "custom", path: ["clauseId"], message: "A clause version requires a clause ID." });
});
export const templateDefinitionSchema = z.object({
 name: z.string().trim().min(3).max(160), description: z.string().trim().max(1000).optional(),
 contractType: z.enum(CONTRACT_TYPES), fields: z.array(fieldSchema).max(40).default([]), sections: z.array(sectionSchema).min(1).max(60)
}).strict().superRefine((value, ctx) => {
 const keys = value.fields.map(field => field.key);
 if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["fields"], message: "Template field keys must be unique." });
 const declared = new Set(keys);
 for (const section of value.sections) {
  for (const match of section.content.matchAll(/{{\s*([a-z][a-zA-Z0-9_]*)\s*}}/g)) {
   if (!declared.has(match[1]!)) ctx.addIssue({ code: "custom", path: ["sections"], message: `Unknown template field: ${match[1]}` });
  }
  if (/{{[^}]*$|{{\s*}}/.test(section.content)) ctx.addIssue({ code: "custom", path: ["sections"], message: "Template placeholders must use {{fieldKey}} syntax." });
 }
});
export const createClauseSchema = z.object({
 key: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
 title: z.string().trim().min(2).max(160), category: z.string().trim().min(2).max(80), body: z.string().trim().min(1).max(20000)
}).strict();
export const updateClauseSchema = z.object({
 title: z.string().trim().min(2).max(160).optional(), category: z.string().trim().min(2).max(80).optional(),
 body: z.string().trim().min(1).max(20000).optional()
}).strict().refine(value => Object.keys(value).length > 0);
export const generateTemplateSchema = z.object({
 contractNumber: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9._/-]+$/), counterparty: z.string().trim().min(2).max(160),
 ownerId: z.string().regex(/^[a-f\d]{24}$/i).optional(), vendorId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
 startDate: z.string().datetime({ offset: true }).optional(), endDate: z.string().datetime({ offset: true }).optional(),
 currency: z.string().trim().length(3).default("USD"), contractValue: z.number().min(0).max(1_000_000_000_000).optional(),
 values: z.record(z.string(), z.union([z.string().max(4000), z.number(), z.boolean()])).default({})
}).strict().superRefine((value, ctx) => {
 if (value.startDate && value.endDate && new Date(value.endDate) < new Date(value.startDate)) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date." });
});
