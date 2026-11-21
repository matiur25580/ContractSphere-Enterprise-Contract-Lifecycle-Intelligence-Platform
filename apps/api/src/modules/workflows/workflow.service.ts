import mongoose, { Types } from "mongoose";
import { HttpError } from "../../common/http-error.js";
import { Contract } from "../contracts/contract.model.js";
import { User } from "../users/user.model.js";
import { WorkflowDefinition, WorkflowInstance, type WorkflowExecutionStage } from "./workflow.model.js";

const oid = (value: string) => new Types.ObjectId(value);

export async function createWorkflowDefinition(tenantId: string, userId: string, input: { name: string; description?: string; stages: Array<{ name: string; approvalMode: "ALL" | "ANY"; approverUserIds: string[] }> }) {
  const tenant = oid(tenantId);
  const approverIds = [...new Set(input.stages.flatMap(stage => stage.approverUserIds))];
  const activeUsers = await User.find({ tenantId: tenant, _id: { $in: approverIds.map(oid) }, status: "active" }).select("_id").lean();
  if (activeUsers.length !== approverIds.length) throw new HttpError(400, "Every approver must be an active member of this organization.", "INVALID_WORKFLOW_APPROVER");
  try {
    return await WorkflowDefinition.create({
      tenantId: tenant,
      name: input.name,
      description: input.description,
      stages: input.stages.map(stage => ({ ...stage, approverUserIds: stage.approverUserIds.map(oid) })),
      createdBy: oid(userId)
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new HttpError(409, "A workflow with this name already exists.", "WORKFLOW_NAME_EXISTS");
    throw error;
  }
}

export async function listWorkflowDefinitions(tenantId: string) {
  return WorkflowDefinition.find({ tenantId: oid(tenantId) }).sort({ createdAt: -1 }).lean();
}

export async function submitContractForApproval(tenantId: string, userId: string, role: string, contractId: string, definitionId: string) {
  const tenant = oid(tenantId);
  const session = await mongoose.startSession();
  let createdInstance: InstanceType<typeof WorkflowInstance> | undefined;
  try {
    await session.withTransaction(async () => {
      const contract = await Contract.findOne({ _id: contractId, tenantId: tenant, status: "DRAFT" }).session(session);
      if (!contract) throw new HttpError(404, "Draft contract not found.", "CONTRACT_NOT_FOUND");
      if (role === "MEMBER" && contract.ownerId.toString() !== userId) throw new HttpError(403, "Only the contract owner or an organization administrator can submit this contract.", "FORBIDDEN");
      const definition = await WorkflowDefinition.findOne({ _id: definitionId, tenantId: tenant, isActive: true }).session(session).lean();
      if (!definition) throw new HttpError(404, "Active workflow definition not found.", "WORKFLOW_NOT_FOUND");

      const stages: WorkflowExecutionStage[] = definition.stages.map(stage => ({
        name: stage.name,
        approvalMode: stage.approvalMode,
        approverUserIds: stage.approverUserIds,
        status: "PENDING",
        decisions: []
      }));
      const [instance] = await WorkflowInstance.create([{
        tenantId: tenant,
        contractId: contract._id,
        definitionId: definition._id,
        definitionName: definition.name,
        submittedBy: oid(userId),
        status: "IN_PROGRESS",
        currentStageIndex: 0,
        stages,
        active: true
      }], { session });
      if (!instance) throw new HttpError(500, "The approval workflow could not be created.", "WORKFLOW_CREATE_FAILED");

      const updated = await Contract.findOneAndUpdate(
        { _id: contract._id, tenantId: tenant, status: "DRAFT" },
        { $set: { status: "IN_REVIEW", updatedBy: oid(userId) } },
        { new: true, session }
      );
      if (!updated) throw new HttpError(409, "The contract changed while approval was being submitted. Refresh and try again.", "CONTRACT_STATE_CONFLICT");
      createdInstance = instance;
    });
    if (!createdInstance) throw new HttpError(500, "The approval workflow transaction did not produce an instance.", "WORKFLOW_CREATE_FAILED");
    return createdInstance;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new HttpError(409, "This contract already has an active approval workflow.", "WORKFLOW_ALREADY_ACTIVE");
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function listMyApprovalTasks(tenantId: string, userId: string) {
  const tenant = oid(tenantId);
  const user = oid(userId);
  const candidates = await WorkflowInstance.find({
    tenantId: tenant,
    active: true,
    status: "IN_PROGRESS",
    stages: { $elemMatch: { status: "PENDING", approverUserIds: user } }
  }).sort({ startedAt: 1 }).limit(200).lean();
  const current = candidates.filter(item => item.stages[item.currentStageIndex]?.status === "PENDING" &&
    item.stages[item.currentStageIndex]?.approverUserIds.some(id => id.equals(user)));
  const contractIds = current.map(item => item.contractId);
  const contracts = await Contract.find({ tenantId: tenant, _id: { $in: contractIds } }).select("title contractNumber counterparty type contractValue currency").lean();
  const byId = new Map(contracts.map(contract => [contract._id.toString(), contract]));
  return current.map(instance => ({
    ...instance,
    contract: byId.get(instance.contractId.toString()) ?? null,
    currentStage: instance.stages[instance.currentStageIndex]
  }));
}

export async function decideOnWorkflow(tenantId: string, userId: string, instanceId: string, input: { decision: "APPROVE" | "REJECT"; comment?: string }) {
  const tenant = oid(tenantId);
  const user = oid(userId);
  const session = await mongoose.startSession();
  let outcome: InstanceType<typeof WorkflowInstance> | null = null;
  try {
    await session.withTransaction(async () => {
      const instance = await WorkflowInstance.findOne({ _id: instanceId, tenantId: tenant, active: true, status: "IN_PROGRESS" }).session(session);
      if (!instance) throw new HttpError(404, "Active approval task not found.", "WORKFLOW_TASK_NOT_FOUND");
      const stageIndex = instance.currentStageIndex;
      const stage = instance.stages[stageIndex];
      if (!stage || stage.status !== "PENDING" || !stage.approverUserIds.some(id => id.equals(user))) {
        throw new HttpError(403, "You are not an assigned approver for the current stage.", "NOT_ASSIGNED_APPROVER");
      }
      if (stage.decisions.some(item => item.userId.equals(user))) throw new HttpError(409, "You have already submitted a decision for this stage.", "DECISION_ALREADY_RECORDED");

      const decision = { userId: user, decision: input.decision, comment: input.comment, decidedAt: new Date() };
      if (input.decision === "REJECT") {
        const rejected = await WorkflowInstance.findOneAndUpdate(
          { _id: instance._id, tenantId: tenant, active: true, currentStageIndex: stageIndex, [`stages.${stageIndex}.status`]: "PENDING", [`stages.${stageIndex}.decisions.userId`]: { $ne: user } },
          { $push: { [`stages.${stageIndex}.decisions`]: decision }, $set: { [`stages.${stageIndex}.status`]: "REJECTED", status: "REJECTED", active: false, completedAt: new Date() } },
          { new: true, session }
        );
        if (!rejected) throw new HttpError(409, "This approval stage has already changed. Refresh your task list.", "WORKFLOW_STATE_CONFLICT");
        const contractUpdate = await Contract.updateOne(
          { _id: instance.contractId, tenantId: tenant, status: "IN_REVIEW" },
          { $set: { status: "DRAFT", updatedBy: user } },
          { session }
        );
        if (contractUpdate.matchedCount !== 1) throw new HttpError(409, "The contract state changed before the rejection could be committed.", "CONTRACT_STATE_CONFLICT");
        outcome = rejected;
        return;
      }

      const recorded = await WorkflowInstance.findOneAndUpdate(
        { _id: instance._id, tenantId: tenant, active: true, currentStageIndex: stageIndex, [`stages.${stageIndex}.status`]: "PENDING", [`stages.${stageIndex}.decisions.userId`]: { $ne: user } },
        { $push: { [`stages.${stageIndex}.decisions`]: decision } },
        { new: true, session }
      );
      if (!recorded) throw new HttpError(409, "This approval stage has already changed or your decision was already recorded.", "WORKFLOW_STATE_CONFLICT");

      const latestStage = recorded.stages[stageIndex];
      if (!latestStage) throw new HttpError(409, "The approval stage could not be found. Refresh your task list.", "WORKFLOW_STATE_CONFLICT");
      const approvals = latestStage.decisions.filter(item => item.decision === "APPROVE").length;
      const required = latestStage.approvalMode === "ANY" ? 1 : latestStage.approverUserIds.length;
      if (approvals < required) {
        outcome = recorded;
        return;
      }

      const finalStage = stageIndex === recorded.stages.length - 1;
      const advanced = await WorkflowInstance.findOneAndUpdate(
        { _id: recorded._id, tenantId: tenant, active: true, currentStageIndex: stageIndex, [`stages.${stageIndex}.status`]: "PENDING" },
        {
          $set: {
            [`stages.${stageIndex}.status`]: "APPROVED",
            ...(finalStage ? { status: "APPROVED", active: false, completedAt: new Date() } : { currentStageIndex: stageIndex + 1 })
          }
        },
        { new: true, session }
      );
      if (!advanced) throw new HttpError(409, "The approval stage changed before this decision could be committed.", "WORKFLOW_STATE_CONFLICT");
      if (finalStage) {
        const contractUpdate = await Contract.updateOne(
          { _id: instance.contractId, tenantId: tenant, status: "IN_REVIEW" },
          { $set: { status: "APPROVED", updatedBy: user } },
          { session }
        );
        if (contractUpdate.matchedCount !== 1) throw new HttpError(409, "The contract state changed before final approval could be committed.", "CONTRACT_STATE_CONFLICT");
      }
      outcome = advanced;
    });
    if (!outcome) throw new HttpError(500, "The approval transaction did not return an updated workflow.", "WORKFLOW_UPDATE_FAILED");
    return outcome;
  } finally {
    await session.endSession();
  }
}
