import { describe, expect, it } from "vitest";
import { DOCUMENT_JOB_STATUSES } from "../src/modules/intelligence/document-job.model.js";
import { shouldUseOcr } from "../src/modules/intelligence/document-extractor.js";

describe("document processing job states", () => {
  it("exposes the complete durable lifecycle", () => {
    expect(DOCUMENT_JOB_STATUSES).toEqual(["QUEUED", "PROCESSING", "SUCCEEDED", "FAILED"]);
  });
});

describe("scanned PDF OCR selection", () => {
  it("uses OCR only for PDFs with insufficient embedded text", () => {
    expect(shouldUseOcr("application/pdf", "short")).toBe(true);
    expect(shouldUseOcr("application/pdf", "A".repeat(120))).toBe(false);
    expect(shouldUseOcr("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "short")).toBe(false);
  });
});
