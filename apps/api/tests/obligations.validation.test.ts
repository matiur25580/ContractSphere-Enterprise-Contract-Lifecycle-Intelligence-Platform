import { describe, expect, it } from "vitest";
import { createObligationSchema, listObligationsSchema, updateObligationSchema, upsertRenewalSchema } from "../src/modules/obligations/obligation.validation.js";
import { refreshObligationStatus, renewalStatus } from "../src/modules/obligations/obligation.service.js";

const id = "64b000000000000000000001";
const future = "2027-06-01T00:00:00.000Z";
describe("obligation validation", () => {
  it("accepts a tenant-independent obligation payload without accepting tenantId", () => {
    expect(createObligationSchema.safeParse({ contractId: id, title: "Quarterly payment", type: "PAYMENT", dueDate: future }).success).toBe(true);
    expect(createObligationSchema.safeParse({ contractId: id, title: "Quarterly payment", type: "PAYMENT", dueDate: future, tenantId: id }).success).toBe(false);
  });
  it("rejects invalid identifiers and inverted due-date filters", () => {
    expect(createObligationSchema.safeParse({ contractId: "bad", title: "Payment", type: "PAYMENT", dueDate: future }).success).toBe(false);
    expect(listObligationsSchema.safeParse({ dueFrom: "2027-07-01T00:00:00.000Z", dueTo: future }).success).toBe(false);
  });
  it("accepts only non-empty update payloads and known statuses", () => {
    expect(updateObligationSchema.safeParse({}).success).toBe(false);
    expect(updateObligationSchema.safeParse({ status: "COMPLETED" }).success).toBe(true);
    expect(updateObligationSchema.safeParse({ status: "APPROVED" }).success).toBe(false);
  });
});
describe("renewal validation and date rules", () => {
  it("validates notice period bounds and derives date inputs", () => {
    expect(upsertRenewalSchema.safeParse({ expiryDate: future, noticePeriodDays: 60, renewalType: "MANUAL" }).success).toBe(true);
    expect(upsertRenewalSchema.safeParse({ expiryDate: future, noticePeriodDays: 4000, renewalType: "MANUAL" }).success).toBe(false);
  });
  it("marks open obligations overdue without changing terminal statuses", () => {
    const past = new Date("2020-01-01T00:00:00.000Z");
    expect(refreshObligationStatus("PENDING", past)).toBe("OVERDUE");
    expect(refreshObligationStatus("COMPLETED", past)).toBe("COMPLETED");
    expect(refreshObligationStatus("CANCELLED", past)).toBe("CANCELLED");
  });
  it("derives notice-due and expiry states while preserving explicit renewal decisions", () => {
    const now = new Date("2026-11-21T00:00:00.000Z");
    expect(renewalStatus(new Date("2027-01-01"), new Date("2026-10-01"), "MANUAL", "UPCOMING", now)).toBe("NOTICE_DUE");
    expect(renewalStatus(new Date("2026-01-01"), new Date("2025-10-01"), "AUTO", "UPCOMING", now)).toBe("EXPIRED");
    expect(renewalStatus(new Date("2027-01-01"), new Date("2026-10-01"), "MANUAL", "RENEWED", now)).toBe("RENEWED");
  });
});
