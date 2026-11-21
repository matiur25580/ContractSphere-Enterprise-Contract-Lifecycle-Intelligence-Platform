import { describe, expect, it } from "vitest";
import { createWorkflowDefinitionSchema, submitWorkflowSchema, workflowDecisionSchema } from "../src/modules/workflows/workflow.validation.js";

const userA = "64b000000000000000000001";
const userB = "64b000000000000000000002";

describe("workflow definition validation", () => {
  it("accepts sequential stages with multiple approvers", () => {
    const parsed = createWorkflowDefinitionSchema.parse({
      name: "Enterprise agreement review",
      stages: [
        { name: "Legal review", approvalMode: "ALL", approverUserIds: [userA, userB] },
        { name: "Finance approval", approvalMode: "ANY", approverUserIds: [userA] }
      ]
    });
    expect(parsed.stages).toHaveLength(2);
  });
  it("rejects duplicate approvers in one stage", () => {
    expect(createWorkflowDefinitionSchema.safeParse({
      name: "Duplicate approvers",
      stages: [{ name: "Legal review", approvalMode: "ALL", approverUserIds: [userA, userA] }]
    }).success).toBe(false);
  });
  it("requires at least one stage and one approver per stage", () => {
    expect(createWorkflowDefinitionSchema.safeParse({ name: "Empty", stages: [] }).success).toBe(false);
    expect(createWorkflowDefinitionSchema.safeParse({
      name: "No approver",
      stages: [{ name: "Legal review", approvalMode: "ALL", approverUserIds: [] }]
    }).success).toBe(false);
  });
  it("caps the workflow at ten stages and ten approvers per stage", () => {
    const tooManyStages = Array.from({ length: 11 }, (_, index) => ({ name: `Stage ${index + 1}`, approvalMode: "ANY", approverUserIds: [userA] }));
    expect(createWorkflowDefinitionSchema.safeParse({ name: "Too many", stages: tooManyStages }).success).toBe(false);
  });
});

describe("workflow action validation", () => {
  it("requires a MongoDB workflow definition identifier", () => {
    expect(submitWorkflowSchema.safeParse({ workflowDefinitionId: userA }).success).toBe(true);
    expect(submitWorkflowSchema.safeParse({ workflowDefinitionId: "not-an-id" }).success).toBe(false);
  });
  it("accepts only explicit approval decisions", () => {
    expect(workflowDecisionSchema.safeParse({ decision: "APPROVE", comment: "Reviewed." }).success).toBe(true);
    expect(workflowDecisionSchema.safeParse({ decision: "DELETE" }).success).toBe(false);
  });
});
