import { describe, expect, it } from "vitest";
import { DOCUMENT_JOB_STATUSES } from "../src/modules/intelligence/document-job.model.js";

describe("document processing job states", () => {
  it("exposes the complete durable lifecycle", () => {
    expect(DOCUMENT_JOB_STATUSES).toEqual(["QUEUED", "PROCESSING", "SUCCEEDED", "FAILED"]);
  });
});
