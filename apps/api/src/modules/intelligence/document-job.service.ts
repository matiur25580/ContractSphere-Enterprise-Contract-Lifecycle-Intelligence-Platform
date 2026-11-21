import { randomUUID } from "node:crypto";
import { Types, type ClientSession } from "mongoose";
import { HttpError } from "../../common/http-error.js";
import { Contract } from "../contracts/contract.model.js";
import { ContractFile } from "../contracts/contract-file.model.js";
import { DocumentProcessingJob } from "./document-job.model.js";
import { analyzeStoredDocument } from "./intelligence.service.js";

const oid = (value: string) => new Types.ObjectId(value);
const LEASE_MS = 5 * 60 * 1000;
const POLL_MS = 1500;
let timer: NodeJS.Timeout | undefined;
let running = false;
let stopping = false;
const workerId = randomUUID();

export async function enqueueDocumentAnalysis(input: {
  tenantId: string; contractId: string; fileId: string; userId: string; role: string;
}, session?: ClientSession) {
  const contractQuery = Contract.findOne({ _id: input.contractId, tenantId: oid(input.tenantId) }).select("_id").lean();
  const fileQuery = ContractFile.findOne({ _id: input.fileId, contractId: oid(input.contractId), tenantId: oid(input.tenantId) }).select("_id").lean();
  if (session) {
    contractQuery.session(session);
    fileQuery.session(session);
  }
  const [contract, file] = await Promise.all([contractQuery, fileQuery]);
  if (!contract || !file) throw new HttpError(404, "Contract document not found for background processing.", "DOCUMENT_NOT_FOUND");
  const [job] = await DocumentProcessingJob.create([{
    tenantId: oid(input.tenantId), contractId: contract._id, fileId: file._id,
    requestedBy: oid(input.userId), role: input.role, engine: "RULE_BASED",
    status: "QUEUED", attempts: 0, maxAttempts: 3, nextRunAt: new Date()
  }], session ? { session } : {});
  if (!job) throw new HttpError(500, "Document analysis job could not be queued.", "DOCUMENT_JOB_CREATE_FAILED");
  return job;
}

export async function getDocumentAnalysisJob(tenantId: string, userId: string, role: string, contractId: string, jobId: string) {
  const contract = await Contract.findOne({ _id: contractId, tenantId: oid(tenantId) }).select("_id ownerId createdBy").lean();
  if (!contract) throw new HttpError(404, "Contract not found.", "CONTRACT_NOT_FOUND");
  if (!["OWNER", "ADMIN"].includes(role) && contract.ownerId.toString() !== userId && contract.createdBy.toString() !== userId) {
    throw new HttpError(403, "You do not have access to this processing job.", "FORBIDDEN");
  }
  const job = await DocumentProcessingJob.findOne({ _id: jobId, tenantId: oid(tenantId), contractId: contract._id })
    .select("status attempts maxAttempts errorCode errorMessage reportId fileId createdAt updatedAt startedAt completedAt").lean();
  if (!job) throw new HttpError(404, "Document processing job not found.", "JOB_NOT_FOUND");
  return job;
}

export async function listRecentDocumentJobs(tenantId: string, userId: string, role: string) {
  const tenant = oid(tenantId);
  const filter: Record<string, unknown> = { tenantId: tenant };
  if (!["OWNER", "ADMIN"].includes(role)) {
    const contracts = await Contract.find({ tenantId: tenant, $or: [{ ownerId: oid(userId) }, { createdBy: oid(userId) }] }).select("_id").lean();
    filter.contractId = { $in: contracts.map(contract => contract._id) };
  }
  const [jobs, totals] = await Promise.all([
    DocumentProcessingJob.find(filter).sort({ createdAt: -1 }).limit(30).select("status attempts maxAttempts errorCode errorMessage reportId fileId contractId createdAt updatedAt startedAt completedAt").populate("contractId", "title contractNumber").populate("fileId", "originalName version").lean(),
    DocumentProcessingJob.aggregate([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 } } }])
  ]);
  const summary = { queued: 0, processing: 0, succeeded: 0, failed: 0 };
  for (const item of totals) { const key = String(item._id).toLowerCase() as keyof typeof summary; if (key in summary) summary[key] = item.count; }
  return { jobs, summary };
}

async function claimJob() {
  const now = new Date();
  const expiredLease = new Date(now.getTime() - LEASE_MS);
  await DocumentProcessingJob.updateMany(
    { status: "PROCESSING", $expr: { $gte: ["$attempts", "$maxAttempts"] }, lockedAt: { $lte: expiredLease } },
    { $set: { status: "FAILED", errorCode: "WORKER_LEASE_EXPIRED", errorMessage: "The worker stopped before completing the final processing attempt.", completedAt: now }, $unset: { lockedAt: 1, lockedBy: 1 } }
  );
  return DocumentProcessingJob.findOneAndUpdate({
    $expr: { $lt: ["$attempts", "$maxAttempts"] },
    $or: [
      { status: "QUEUED", nextRunAt: { $lte: now } },
      { status: "PROCESSING", lockedAt: { $lte: expiredLease } }
    ]
  }, {
    $set: { status: "PROCESSING", lockedAt: now, lockedBy: workerId, startedAt: now },
    $inc: { attempts: 1 }
  }, { new: true, sort: { nextRunAt: 1, createdAt: 1 } });
}

async function processOne() {
  const job = await claimJob();
  if (!job) return;
  const heartbeat = setInterval(() => {
    void DocumentProcessingJob.updateOne(
      { _id: job._id, status: "PROCESSING", lockedBy: workerId },
      { $set: { lockedAt: new Date() } }
    ).catch(error => console.error("Document processing lease heartbeat failed:", error));
  }, Math.floor(LEASE_MS / 3));
  heartbeat.unref();
  try {
    const report = await analyzeStoredDocument(
      job.tenantId.toString(), job.requestedBy.toString(), job.role,
      job.contractId.toString(), job.fileId.toString(), job.engine, job._id.toString()
    );
    await DocumentProcessingJob.updateOne(
      { _id: job._id, status: "PROCESSING", lockedBy: workerId },
      { $set: { status: "SUCCEEDED", reportId: report._id, completedAt: new Date() }, $unset: { lockedAt: 1, lockedBy: 1, errorCode: 1, errorMessage: 1 } }
    );
  } catch (error) {
    const code = error instanceof HttpError ? error.code : "DOCUMENT_PROCESSING_FAILED";
    const message = error instanceof Error ? error.message.slice(0, 280) : "Document processing failed.";
    const terminal = job.attempts >= job.maxAttempts;
    const delay = Math.min(5 * 60 * 1000, 1000 * 2 ** job.attempts);
    await DocumentProcessingJob.updateOne(
      { _id: job._id, status: "PROCESSING", lockedBy: workerId },
      {
        $set: {
          status: terminal ? "FAILED" : "QUEUED",
          nextRunAt: new Date(Date.now() + delay),
          errorCode: code, errorMessage: message,
          ...(terminal ? { completedAt: new Date() } : {})
        },
        $unset: { lockedAt: 1, lockedBy: 1 }
      }
    );
  } finally {
    clearInterval(heartbeat);
  }
}

async function tick() {
  if (stopping || running) return schedule();
  running = true;
  try { await processOne(); }
  catch (error) { console.error("Document processing worker error:", error); }
  finally { running = false; schedule(); }
}
function schedule() {
  if (stopping) return;
  timer = setTimeout(() => { void tick(); }, POLL_MS);
  timer.unref();
}
export function startDocumentJobWorker() {
  if (timer || stopping) return;
  console.info("Document processing worker started.");
  void tick();
}
export async function stopDocumentJobWorker() {
  stopping = true;
  if (timer) clearTimeout(timer);
  while (running) await new Promise(resolve => setTimeout(resolve, 50));
  console.info("Document processing worker stopped.");
}
