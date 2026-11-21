import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { HttpError } from "../../common/http-error.js";
import { Contract } from "../contracts/contract.model.js";
import { ContractFile } from "../contracts/contract-file.model.js";
import { readStoredObject } from "../contracts/storage.service.js";
import { extractDocumentText, MAX_DOCUMENT_BYTES } from "./document-extractor.js";
import { analyzeWithConfiguredAI } from "./ai-provider.service.js";
import { ContractIntelligenceReport } from "./intelligence.model.js";

export type FindingSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export interface IntelligenceFinding {
  key: string; category: string; title: string; severity: FindingSeverity;
  confidence: number; explanation: string; evidence: { excerpt: string; start: number; end: number } | null;
}
const clauses = [
  { key: "confidentiality", label: "Confidentiality", terms: /\b(confidential(?:ity| information)|non[- ]disclosure)\b/i },
  { key: "liability", label: "Limitation of liability", terms: /\b(limitation of liability|liability cap|aggregate liability)\b/i },
  { key: "indemnity", label: "Indemnification", terms: /\b(indemnif(?:y|ication|ies))\b/i },
  { key: "termination", label: "Termination", terms: /\b(terminat(?:e|ion)|early termination)\b/i },
  { key: "governing_law", label: "Governing law", terms: /\b(governing law|laws of the state|laws of [A-Z][a-z]+)\b/i },
  { key: "disputes", label: "Dispute resolution", terms: /\b(arbitration|dispute resolution|jurisdiction|venue)\b/i },
  { key: "payment", label: "Payment terms", terms: /\b(payment terms|invoice|net\s*\d+|fees and expenses)\b/i },
  { key: "data_protection", label: "Data protection", terms: /\b(data protection|personal data|data processing|privacy)\b/i },
  { key: "renewal", label: "Renewal", terms: /\b(renewal|automatically renew|auto[- ]renew)\b/i },
  { key: "force_majeure", label: "Force majeure", terms: /\b(force majeure)\b/i }
] as const;
function evidenceFor(text: string, expression: RegExp) {
  const match = expression.exec(text);
  if (!match || match.index === undefined) return null;
  const start = Math.max(0, text.lastIndexOf(".", match.index) + 1);
  const period = text.indexOf(".", match.index + match[0].length);
  const end = Math.min(text.length, period === -1 ? Math.min(text.length, match.index + 240) : period + 1);
  return { excerpt: text.slice(start, end).trim().slice(0, 500), start, end };
}
export function analyzeContractText(sourceText: string) {
  const text = sourceText.normalize("NFKC");
  const findings: IntelligenceFinding[] = [];
  const extractedClauses = clauses.map(clause => {
    const evidence = evidenceFor(text, clause.terms);
    return { key: clause.key, label: clause.label, found: Boolean(evidence), evidence };
  });
  const add = (finding: IntelligenceFinding) => findings.push(finding);
  const uncapped = evidenceFor(text, /\b(unlimited liability|liability\s+(?:is\s+)?unlimited|unlimited damages|without limitation of liability)\b/i);
  if (uncapped) add({ key: "uncapped_liability", category: "LIABILITY", title: "Potential uncapped liability", severity: "CRITICAL", confidence: 0.96, explanation: "The text expressly refers to unlimited liability or damages. Confirm whether this is intended and whether exclusions or caps apply elsewhere.", evidence: uncapped });
  const broadIndemnity = evidenceFor(text, /\b(indemnif(?:y|ies|ication))\b[^.]{0,180}\b(all claims|any and all|regardless of fault|including negligence)\b/i);
  if (broadIndemnity) add({ key: "broad_indemnity", category: "INDEMNITY", title: "Broad indemnity wording", severity: "HIGH", confidence: 0.82, explanation: "The indemnity language appears broad. Review scope, causation, third-party claims, procedures and negligence carve-outs.", evidence: broadIndemnity });
  const autoRenewal = evidenceFor(text, /\b(automatically renew|auto[- ]renew(?:al)?)\b/i);
  if (autoRenewal && !/\b(non[- ]renewal notice|notice of non[- ]renewal|opt[- ]out notice|written notice at least)\b/i.test(text)) add({ key: "renewal_notice_unclear", category: "RENEWAL", title: "Automatic renewal notice is unclear", severity: "MEDIUM", confidence: 0.78, explanation: "Automatic renewal language was found, but a clear non-renewal notice mechanism was not detected.", evidence: autoRenewal });
  const missingTerms = extractedClauses.filter(item => !item.found).map(item => item.label);
  if (!extractedClauses.find(item => item.key === "governing_law")?.found) add({ key: "missing_governing_law", category: "GOVERNANCE", title: "Governing law not detected", severity: "MEDIUM", confidence: 0.88, explanation: "No governing-law wording was detected. Confirm whether this is appropriate for the agreement.", evidence: null });
  if (!extractedClauses.find(item => item.key === "liability")?.found) add({ key: "missing_liability_cap", category: "LIABILITY", title: "Limitation of liability not detected", severity: "MEDIUM", confidence: 0.86, explanation: "No limitation-of-liability clause was detected. Legal review should confirm whether a cap or exclusions are needed.", evidence: null });
  if (!extractedClauses.find(item => item.key === "data_protection")?.found) add({ key: "missing_data_protection", category: "PRIVACY", title: "Data protection terms not detected", severity: "LOW", confidence: 0.75, explanation: "No data-protection wording was detected. Assess whether personal data is processed and whether a DPA is required.", evidence: null });
  const severityRank: Record<FindingSeverity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  const counts = findings.reduce((result, item) => { result[item.severity] += 1; return result; }, { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 });
  return {
    engine: "RULE_BASED" as const, analysisVersion: "rules-v1",
    summary: `Reviewed ${text.length.toLocaleString()} characters. Detected ${extractedClauses.filter(item => item.found).length} of ${clauses.length} clause categories and ${findings.length} review flags.`,
    findings: findings.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]),
    extractedClauses, missingTerms, riskCounts: counts
  };
}
const oid = (value: string) => new Types.ObjectId(value);
export async function authorizedContract(tenantId: string, userId: string, role: string, contractId: string) {
  const contract = await Contract.findOne({ _id: contractId, tenantId: oid(tenantId) }).select("_id ownerId createdBy").lean();
  if (!contract) throw new HttpError(404, "Contract not found.", "CONTRACT_NOT_FOUND");
  if (!["OWNER", "ADMIN"].includes(role) && contract.ownerId.toString() !== userId && contract.createdBy.toString() !== userId) throw new HttpError(403, "You do not have access to analyze this contract.", "FORBIDDEN");
  return contract;
}
export async function analyzeContract(tenantId: string, userId: string, role: string, contractId: string, sourceText: string, sourceLabel: string, engine: "RULE_BASED" | "AI_COMPATIBLE" = "RULE_BASED") {
  const contract = await authorizedContract(tenantId, userId, role, contractId);
  const result = engine === "AI_COMPATIBLE" ? await analyzeWithConfiguredAI(sourceText) : analyzeContractText(sourceText);
  const sourceFingerprint = createHash("sha256").update(sourceText.normalize("NFKC")).digest("hex");
  const report = await ContractIntelligenceReport.create({
    tenantId: oid(tenantId), contractId: contract._id, createdBy: oid(userId), sourceLabel,
    sourceFingerprint, sourceLength: sourceText.length, ...result
  });
  return report;
}
export async function analyzeStoredDocument(tenantId: string, userId: string, role: string, contractId: string, fileId: string, engine: "RULE_BASED" | "AI_COMPATIBLE" = "RULE_BASED") {
  const contract = await authorizedContract(tenantId, userId, role, contractId);
  const file = await ContractFile.findOne({ _id: fileId, tenantId: oid(tenantId), contractId: contract._id }).lean();
  if (!file) throw new HttpError(404, "Document version not found for this contract.", "DOCUMENT_NOT_FOUND");
  if (!["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.mimeType)) throw new HttpError(415, "Only PDF and DOCX documents can be analyzed.", "UNSUPPORTED_DOCUMENT_TYPE");
  if (file.sizeBytes > MAX_DOCUMENT_BYTES) throw new HttpError(413, "The document exceeds the 10 MB analysis limit.", "DOCUMENT_TOO_LARGE");
  const buffer = await readStoredObject(file.objectKey, MAX_DOCUMENT_BYTES);
  const sourceText = await extractDocumentText(buffer, file.mimeType);
  return analyzeContract(tenantId, userId, role, contractId, sourceText, file.originalName, engine);
}
export async function listContractAnalyses(tenantId: string, userId: string, role: string, contractId: string) {
  const contract = await authorizedContract(tenantId, userId, role, contractId);
  return ContractIntelligenceReport.find({ tenantId: oid(tenantId), contractId: contract._id })
    .sort({ createdAt: -1, _id: -1 }).limit(20).lean();
}
