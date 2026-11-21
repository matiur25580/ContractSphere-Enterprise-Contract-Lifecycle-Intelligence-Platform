import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { HttpError } from "../../common/http-error.js";
import { Contract } from "../contracts/contract.model.js";
import { ContractFile } from "../contracts/contract-file.model.js";
import { readStoredObject } from "../contracts/storage.service.js";
import { extractDocumentText, MAX_DOCUMENT_BYTES } from "./document-extractor.js";
import { ContractComparison } from "./comparison.model.js";
import { analyzeContractText, authorizedContract } from "./intelligence.service.js";

const oid = (value: string) => new Types.ObjectId(value);
const fingerprint = (value: string) => createHash("sha256").update(value.normalize("NFKC")).digest("hex");
function sentenceSet(value: string) {
  return value.split(/(?<=[.!?])\s+|\n+/).map(item => item.trim().replace(/\s+/g, " "))
    .filter(item => item.length >= 18).slice(0, 1000);
}
function compareSentences(before: string, after: string) {
  const oldItems = sentenceSet(before);
  const newItems = sentenceSet(after);
  const oldSet = new Set(oldItems.map(item => item.toLocaleLowerCase()));
  const newSet = new Set(newItems.map(item => item.toLocaleLowerCase()));
  const additions = newItems.filter(item => !oldSet.has(item.toLocaleLowerCase())).slice(0, 30);
  const removals = oldItems.filter(item => !newSet.has(item.toLocaleLowerCase())).slice(0, 30);
  const union = new Set([...oldSet, ...newSet]).size;
  const intersection = [...oldSet].filter(item => newSet.has(item)).length;
  return { additions, removals, similarityScore: union ? Math.round(intersection / union * 100) : 100 };
}
async function loadVersionText(tenantId: string, contractId: string, fileId: string) {
  const file = await ContractFile.findOne({ _id: fileId, tenantId: oid(tenantId), contractId: oid(contractId) }).lean();
  if (!file) throw new HttpError(404, "A selected document version was not found for this contract.", "DOCUMENT_NOT_FOUND");
  if (!["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.mimeType))
    throw new HttpError(415, "Only PDF and DOCX versions can be compared.", "UNSUPPORTED_DOCUMENT_TYPE");
  if (file.sizeBytes > MAX_DOCUMENT_BYTES) throw new HttpError(413, "A selected version exceeds the 10 MB comparison limit.", "DOCUMENT_TOO_LARGE");
  const bytes = await readStoredObject(file.objectKey, MAX_DOCUMENT_BYTES);
  return { text: await extractDocumentText(bytes, file.mimeType), label: file.originalName + " · v" + file.version };
}
export function compareTextSources(baselineText: string, candidateText: string) {
  const before = analyzeContractText(baselineText);
  const after = analyzeContractText(candidateText);
  const beforeClauses = new Map(before.extractedClauses.map(item => [item.key, item]));
  const clauseChanges = after.extractedClauses.map(item => {
    const old = beforeClauses.get(item.key);
    return { key: item.key, label: item.label, change: item.found && !old?.found ? "ADDED" : !item.found && old?.found ? "REMOVED" : "UNCHANGED", baselineEvidence: old?.evidence?.excerpt ?? null, candidateEvidence: item.evidence?.excerpt ?? null };
  });
  const beforeFindings = new Map(before.findings.map(item => [item.key, item]));
  const afterFindings = new Map(after.findings.map(item => [item.key, item]));
  const findingChanges = [...new Set([...beforeFindings.keys(), ...afterFindings.keys()])].map(key => {
    const old = beforeFindings.get(key); const current = afterFindings.get(key);
    return { key, title: current?.title ?? old!.title, change: !old ? "NEW" : !current ? "RESOLVED" : old.severity !== current.severity ? "CHANGED" : "UNCHANGED", baselineSeverity: old?.severity ?? null, candidateSeverity: current?.severity ?? null };
  }).filter(item => item.change !== "UNCHANGED");
  const textChanges = compareSentences(baselineText, candidateText);
  return { clauseChanges, findingChanges, additions: textChanges.additions, removals: textChanges.removals, similarityScore: textChanges.similarityScore };
}
export async function compareContractSources(input: {
  tenantId: string; userId: string; role: string; contractId: string;
  baselineText?: string; candidateText?: string; baselineLabel?: string; candidateLabel?: string;
  baselineFileId?: string; candidateFileId?: string;
}) {
  const contract = await authorizedContract(input.tenantId, input.userId, input.role, input.contractId);
  let baselineText = input.baselineText;
  let candidateText = input.candidateText;
  let baselineLabel = input.baselineLabel || "Baseline text";
  let candidateLabel = input.candidateLabel || "Candidate text";
  if (input.baselineFileId && input.candidateFileId) {
    const [before, after] = await Promise.all([
      loadVersionText(input.tenantId, input.contractId, input.baselineFileId),
      loadVersionText(input.tenantId, input.contractId, input.candidateFileId)
    ]);
    baselineText = before.text; candidateText = after.text;
    baselineLabel = before.label; candidateLabel = after.label;
  }
  if (!baselineText || !candidateText || baselineText.length < 100 || candidateText.length < 100)
    throw new HttpError(400, "Both contract versions must contain at least 100 characters.", "INVALID_COMPARISON_SOURCE");
  if (baselineText.length > 30000 || candidateText.length > 30000)
    throw new HttpError(413, "Each contract version is limited to 30,000 characters.", "COMPARISON_SOURCE_TOO_LONG");

  const before = analyzeContractText(baselineText);
  const after = analyzeContractText(candidateText);
  const beforeClauses = new Map(before.extractedClauses.map(item => [item.key, item]));
  const afterClauses = new Map(after.extractedClauses.map(item => [item.key, item]));
  const clauseChanges = after.extractedClauses.map(item => {
    const old = beforeClauses.get(item.key);
    return {
      key: item.key, label: item.label,
      change: item.found && !old?.found ? "ADDED" : !item.found && old?.found ? "REMOVED" : "UNCHANGED",
      baselineEvidence: old?.evidence?.excerpt ?? null, candidateEvidence: item.evidence?.excerpt ?? null
    };
  });
  const beforeFindings = new Map(before.findings.map(item => [item.key, item]));
  const afterFindings = new Map(after.findings.map(item => [item.key, item]));
  const findingChanges = [...new Set([...beforeFindings.keys(), ...afterFindings.keys()])].map(key => {
    const old = beforeFindings.get(key); const current = afterFindings.get(key);
    return {
      key, title: current?.title ?? old!.title,
      change: !old ? "NEW" : !current ? "RESOLVED" : old.severity !== current.severity ? "CHANGED" : "UNCHANGED",
      baselineSeverity: old?.severity ?? null, candidateSeverity: current?.severity ?? null
    };
  }).filter(item => item.change !== "UNCHANGED");
  const textChanges = compareSentences(baselineText, candidateText);
  const addedClauses = clauseChanges.filter(item => item.change === "ADDED").length;
  const removedClauses = clauseChanges.filter(item => item.change === "REMOVED").length;
  const newRisks = findingChanges.filter(item => item.change === "NEW" || (item.change === "CHANGED" && ["HIGH", "CRITICAL"].includes(item.candidateSeverity ?? ""))).length;
  const summary = "Compared " + baselineLabel + " with " + candidateLabel + ": " + addedClauses + " clause categories added, " + removedClauses + " removed, " + textChanges.additions.length + " text additions and " + textChanges.removals.length + " removals captured. " + newRisks + " new or elevated risk signals require review.";
  return ContractComparison.create({
    tenantId: oid(input.tenantId), contractId: contract._id, createdBy: oid(input.userId),
    baselineLabel: baselineLabel.slice(0, 120), candidateLabel: candidateLabel.slice(0, 120),
    baselineFingerprint: fingerprint(baselineText), candidateFingerprint: fingerprint(candidateText),
    baselineLength: baselineText.length, candidateLength: candidateText.length,
    similarityScore: textChanges.similarityScore, clauseChanges, findingChanges,
    additions: textChanges.additions.map(excerpt => ({ excerpt: excerpt.slice(0, 500) })),
    removals: textChanges.removals.map(excerpt => ({ excerpt: excerpt.slice(0, 500) })), summary
  });
}
export async function listContractComparisons(tenantId: string, userId: string, role: string, contractId: string) {
  const contract = await authorizedContract(tenantId, userId, role, contractId);
  return ContractComparison.find({ tenantId: oid(tenantId), contractId: contract._id })
    .sort({ createdAt: -1, _id: -1 }).limit(20).lean();
}
