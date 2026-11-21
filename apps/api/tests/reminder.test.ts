import { describe, expect, it } from "vitest";
import { getObligationReminderType, getRenewalReminderType } from "../src/modules/obligations/reminder.service.js";

describe("obligation and renewal reminder classification", () => {
  const now = new Date("2026-11-21T12:00:00.000Z");
  it("distinguishes upcoming and overdue obligations", () => {
    expect(getObligationReminderType(new Date("2026-11-23T12:00:00.000Z"), now)).toBe("OBLIGATION_DUE_SOON");
    expect(getObligationReminderType(new Date("2026-11-20T12:00:00.000Z"), now)).toBe("OBLIGATION_OVERDUE");
  });
  it("distinguishes approaching and passed renewal notice deadlines", () => {
    expect(getRenewalReminderType(new Date("2026-11-23T12:00:00.000Z"), now)).toBe("RENEWAL_NOTICE_DUE");
    expect(getRenewalReminderType(new Date("2026-11-20T12:00:00.000Z"), now)).toBe("RENEWAL_NOTICE_OVERDUE");
  });
});
