import { describe, expect, it } from "vitest";
import { createClauseSchema, generateTemplateSchema, templateDefinitionSchema, updateClauseSchema } from "../src/modules/templates/template.validation.js";
describe("contract template validation", () => {
 const valid = { name: "Mutual NDA", contractType: "NDA", fields: [{ key: "effectiveDate", label: "Effective date", type: "DATE", required: true }], sections: [{ heading: "Effective date", content: "Starts on {{effectiveDate}}." }] };
 it("accepts declared placeholders and dynamic fields", () => { expect(templateDefinitionSchema.safeParse(valid).success).toBe(true); });
 it("rejects unknown placeholders, duplicate keys, and tenant injection", () => {
  expect(templateDefinitionSchema.safeParse({ ...valid, sections: [{ heading: "Date", content: "{{unknownField}}" }] }).success).toBe(false);
  expect(templateDefinitionSchema.safeParse({ ...valid, fields: [valid.fields[0], valid.fields[0]] }).success).toBe(false);
  expect(templateDefinitionSchema.safeParse({ ...valid, tenantId: "64b000000000000000000001" }).success).toBe(false);
 });
 it("requires choice options and a clause ID for pinned versions", () => {
  expect(templateDefinitionSchema.safeParse({ ...valid, fields: [{ key: "governingLaw", label: "Governing law", type: "CHOICE" }] }).success).toBe(false);
  expect(templateDefinitionSchema.safeParse({ ...valid, sections: [{ heading: "Terms", content: "Text", clauseVersion: 2 }] }).success).toBe(false);
 });
 it("validates generated contract metadata and rejects tenant injection", () => {
  expect(generateTemplateSchema.safeParse({ contractNumber: "NDA-01", counterparty: "Northstar Ltd", values: { effectiveDate: "2026-01-01" } }).success).toBe(true);
  expect(generateTemplateSchema.safeParse({ contractNumber: "NDA 01", counterparty: "Northstar Ltd" }).success).toBe(false);
  expect(generateTemplateSchema.safeParse({ contractNumber: "NDA-01", counterparty: "Northstar Ltd", tenantId: "64b000000000000000000001" }).success).toBe(false);
 });
});
describe("clause library validation", () => {
 it("accepts reusable clauses and rejects unsafe keys", () => {
  expect(createClauseSchema.safeParse({ key: "limitation-of-liability", title: "Limitation of liability", category: "Risk", body: "Neither party..." }).success).toBe(true);
  expect(createClauseSchema.safeParse({ key: "../admin", title: "Clause", category: "Risk", body: "Text" }).success).toBe(false);
 });
 it("rejects empty clause edits", () => { expect(updateClauseSchema.safeParse({}).success).toBe(false); });
});
