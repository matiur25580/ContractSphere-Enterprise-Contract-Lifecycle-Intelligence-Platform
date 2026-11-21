import { describe, expect, it } from "vitest";
import { getReadinessSnapshot } from "../src/modules/health/health.routes.js";

describe("health readiness", () => {
  it("reports ready only when MongoDB is connected", () => {
    expect(getReadinessSnapshot(true)).toEqual({ status: "ready", checks: { database: "connected" } });
  });
  it("reports not_ready while MongoDB is disconnected", () => {
    expect(getReadinessSnapshot(false)).toEqual({ status: "not_ready", checks: { database: "disconnected" } });
  });
});
