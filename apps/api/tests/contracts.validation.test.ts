import { describe, expect, it } from "vitest";
import { createContractSchema, listContractsSchema, updateContractSchema, uploadIntentSchema } from "../src/modules/contracts/contract.validation.js";

describe("contract metadata validation", () => {
  const valid = {
    title: "Master Services Agreement",
    contractNumber: "MSA-2026-0042",
    type: "MSA",
    counterparty: "Northstar Systems",
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2027-01-01T00:00:00.000Z",
    currency: "usd",
    contractValue: 125000,
    tags: ["enterprise", "technology"]
  };
  it("normalizes currency and converts date strings", () => {
    const parsed = createContractSchema.parse(valid);
    expect(parsed.currency).toBe("USD");
    expect(parsed.startDate).toBeInstanceOf(Date);
  });
  it("rejects an end date earlier than the start date", () => {
    expect(createContractSchema.safeParse({ ...valid, endDate: "2025-01-01T00:00:00.000Z" }).success).toBe(false);
  });
  it("accepts a valid vendor link and rejects malformed vendor identifiers", () => {\n    expect(createContractSchema.safeParse({ ...valid, vendorId: "64b000000000000000000001" }).success).toBe(true);\n    expect(createContractSchema.safeParse({ ...valid, vendorId: "not-an-object-id" }).success).toBe(false);\n  });\n  it("rejects invalid contract numbers", () => {
    expect(createContractSchema.safeParse({ ...valid, contractNumber: "bad number!" }).success).toBe(false);
  });
  it("does not permit contract number mutation through the update schema", () => {
    expect(updateContractSchema.safeParse({ contractNumber: "MSA-CHANGED" }).success).toBe(false);
  });
});

describe("contract listing validation", () => {
  it("applies safe pagination defaults", () => {
    expect(listContractsSchema.parse({}).limit).toBe(20);
    expect(listContractsSchema.parse({}).page).toBe(1);
  });
  it("caps page size at 100", () => {
    expect(listContractsSchema.safeParse({ limit: "1000" }).success).toBe(false);
  });
});

describe("document upload validation", () => {
  it("accepts a PDF within the 25 MiB limit", () => {
    expect(uploadIntentSchema.safeParse({ filename: "agreement.pdf", contentType: "application/pdf", sizeBytes: 1024 }).success).toBe(true);
  });
  it("rejects unsupported formats and oversized files", () => {
    expect(uploadIntentSchema.safeParse({ filename: "script.exe", contentType: "application/octet-stream", sizeBytes: 100 }).success).toBe(false);
    expect(uploadIntentSchema.safeParse({ filename: "large.pdf", contentType: "application/pdf", sizeBytes: 26 * 1024 * 1024 }).success).toBe(false);
  });
  it("rejects path-like filenames", () => {
    expect(uploadIntentSchema.safeParse({ filename: "../agreement.pdf", contentType: "application/pdf", sizeBytes: 1024 }).success).toBe(false);
  });
});
