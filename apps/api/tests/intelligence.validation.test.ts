import { describe, expect, it } from "vitest";
import { analyzeContractText } from "../src/modules/intelligence/intelligence.service.js";
import { extractDocumentText } from "../src/modules/intelligence/document-extractor.js";
import { groundQuote } from "../src/modules/intelligence/ai-provider.service.js";
describe("evidence-grounded contract intelligence", () => {
 it("extracts clause categories with source offsets and excerpts", () => {
  const source = "The parties agree to confidentiality obligations. This agreement is governed by the laws of England. The supplier will indemnify the customer for all claims. Liability is unlimited.";
  const result = analyzeContractText(source);
  const governing = result.extractedClauses.find(item => item.key === "governing_law");
  expect(governing?.found).toBe(true);
  expect(governing?.evidence?.start).toBeGreaterThanOrEqual(0);
  expect(source.slice(governing!.evidence!.start, governing!.evidence!.end)).toContain("governed by");
  expect(result.findings.some(item => item.key === "uncapped_liability" && item.severity === "CRITICAL")).toBe(true);
 });
 it("flags missing clauses without inventing source citations", () => {
  const result = analyzeContractText("A short agreement with no clause language.");
  expect(result.missingTerms).toContain("Governing law");
  expect(result.findings.find(item => item.key === "missing_governing_law")?.evidence).toBeNull();
 });
 it("does not flag an automatic renewal notice when an opt-out mechanism is present", () => {
  const result = analyzeContractText("This agreement will automatically renew unless either party provides written notice of non-renewal at least 30 days before expiry.");
  expect(result.findings.some(item => item.key === "renewal_notice_unclear")).toBe(false);
 });
 it("identifies an automatic renewal without clear notice language", () => {
  const result = analyzeContractText("This agreement will automatically renew for successive one-year terms.");
  expect(result.findings.some(item => item.key === "renewal_notice_unclear")).toBe(true);
 });
 it("grounds AI evidence only when an exact quote exists in source text", () => {
  const source = "The supplier shall maintain confidentiality and protect all personal data.";
  const quote = groundQuote(source, "maintain confidentiality");
  expect(quote?.start).toBe(source.indexOf("maintain confidentiality"));
  expect(groundQuote(source, "the supplier is liable for all losses")).toBeNull();
 });
 it("rejects unsupported document formats without parsing", async () => {
  await expect(extractDocumentText(Buffer.from("plain text"), "text/plain")).rejects.toMatchObject({ code: "UNSUPPORTED_DOCUMENT_TYPE" });
 });
});
