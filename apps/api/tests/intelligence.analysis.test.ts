import { describe, expect, it } from "vitest";
import { analyzeContractText } from "../src/modules/intelligence/intelligence.service.js";

describe("contract intelligence rule analysis", () => {
  it("normalizes Unicode text before matching clauses", () => {
    const result = analyzeContractText("CONFIDENTIALITY obligations apply. Governing law: laws of England.");
    expect(result.extractedClauses.find(item => item.key === "confidentiality")?.found).toBe(true);
    expect(result.extractedClauses.find(item => item.key === "governing_law")?.found).toBe(true);
  });

  it("flags express uncapped liability as critical and preserves evidence offsets", () => {
    const source = "The parties agree that liability is unlimited for all claims.";
    const result = analyzeContractText(source);
    const finding = result.findings.find(item => item.key === "uncapped_liability");
    expect(finding).toMatchObject({ severity: "CRITICAL", category: "LIABILITY" });
    expect(finding?.evidence?.excerpt).toContain("liability is unlimited");
    expect(source.slice(finding!.evidence!.start, finding!.evidence!.end)).toBe(finding!.evidence!.excerpt);
    expect(result.riskCounts.CRITICAL).toBe(1);
  });

  it("detects broad indemnity language without inventing evidence", () => {
    const result = analyzeContractText("The supplier shall indemnify the customer against any and all claims.");
    const finding = result.findings.find(item => item.key === "broad_indemnity");
    expect(finding?.severity).toBe("HIGH");
    expect(finding?.evidence?.excerpt).toContain("indemnify");
  });

  it("reports missing governance, liability and privacy terms", () => {
    const result = analyzeContractText("The parties agree to deliver the services on time.");
    expect(result.findings.map(item => item.key)).toEqual(expect.arrayContaining([
      "missing_governing_law", "missing_liability_cap", "missing_data_protection"
    ]));
    expect(result.missingTerms).toContain("Governing law");
    expect(result.missingTerms).toContain("Data protection");
  });

  it("does not flag automatic renewal when a non-renewal notice mechanism is present", () => {
    const result = analyzeContractText("This agreement shall automatically renew unless written notice of non-renewal is provided.");
    expect(result.findings.some(item => item.key === "renewal_notice_unclear")).toBe(false);
  });

  it("sorts findings by descending severity and keeps risk counts consistent", () => {
    const result = analyzeContractText("Unlimited liability applies. The agreement shall automatically renew.");
    const ranks = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    expect(result.findings.map(item => ranks[item.severity])).toEqual(
      [...result.findings.map(item => ranks[item.severity])].sort((a, b) => b - a)
    );
    for (const severity of ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const) {
      expect(result.riskCounts[severity]).toBe(result.findings.filter(item => item.severity === severity).length);
    }
  });
});
