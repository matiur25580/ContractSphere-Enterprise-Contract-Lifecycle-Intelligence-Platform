<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useAuthStore } from "./stores/auth.store";

interface ContractSummary {
  _id: string;
  title: string;
  contractNumber: string;
  type: string;
  status: string;
  counterparty: string;
  currency: string;
  contractValue?: number;
  latestVersion: number;
  latestDocumentId?: string;
  updatedAt: string;
}
interface ContractList { items: ContractSummary[]; pagination: { page: number; limit: number; total: number; pages: number }; }
interface WorkflowDefinition { _id: string; name: string; stages: Array<{ name: string; approvalMode: 'ALL' | 'ANY'; approverUserIds: string[] }>; }
interface ApprovalTask { _id: string; definitionName: string; currentStage: { name: string; approvalMode: string; approverUserIds: string[] }; contract: { title: string; contractNumber: string; counterparty: string } | null; }
interface ObligationItem { _id: string; title: string; type: string; status: string; priority: string; dueDate: string; contractId: { title: string; contractNumber: string } | string; ownerId: { name: string } | string; }
interface RenewalItem { _id: string; expiryDate: string; noticeDeadline: string; noticePeriodDays: number; renewalType: string; status: string; contractId: { title: string; contractNumber: string; counterparty: string } | null; }
interface VendorItem { _id: string; legalName: string; displayName?: string; category: string; status: string; country?: string; industry?: string; riskLevel: string; riskScore: number; contacts: Array<{ name: string; email: string; primary: boolean }>; certifications: Array<{ name: string; status: string }> }
interface NotificationItem { _id: string; type: string; title: string; body: string; link?: string; readAt: string | null; createdAt: string }
interface TemplateItem { _id: string; name: string; contractType: string; version: number; status: string; fields: Array<{ key: string; label: string; type: string; required: boolean; options: string[] }>; sections: Array<{ heading: string; content: string }> }
interface ClauseItem { _id: string; key: string; title: string; category: string; body: string; version: number }
interface IntelligenceReport { _id: string; engine: string; summary: string; findings: Array<{ key: string; title: string; category: string; severity: string; confidence: number; explanation: string; evidence: { excerpt: string; start: number; end: number } | null }>; extractedClauses: Array<{ key: string; label: string; found: boolean }>; missingTerms: string[]; riskCounts: Record<string, number>; createdAt: string }\ninterface ContractComparison { _id: string; baselineLabel: string; candidateLabel: string; similarityScore: number; summary: string; clauseChanges: Array<{ key: string; label: string; change: string; baselineEvidence: string | null; candidateEvidence: string | null }>; findingChanges: Array<{ key: string; title: string; change: string; baselineSeverity: string | null; candidateSeverity: string | null }>; additions: Array<{ excerpt: string }>; removals: Array<{ excerpt: string }>; createdAt: string }

const auth = useAuthStore();
const notifications = ref<NotificationItem[]>([]);
const unreadNotifications = ref(0);
const notificationsOpen = ref(false);
const loadingNotifications = ref(false);
const mode = ref<"login" | "register">("login");
const errorMessage = ref("");
const successMessage = ref("");
const loadingContracts = ref(false);
const creatingContract = ref(false);
const contracts = ref<ContractSummary[]>([]);
const search = ref("");
const statusFilter = ref("");
const workflowDefinitions = ref<WorkflowDefinition[]>([]);
const approvalTasks = ref<ApprovalTask[]>([]);
const obligations = ref<ObligationItem[]>([]);
const renewals = ref<RenewalItem[]>([]);
const renewalSummary = ref({ upcoming: 0, noticeDue: 0, inProgress: 0, expired: 0 });
const obligationForm = reactive({ contractId: "", title: "", type: "DELIVERABLE", priority: "MEDIUM", dueDate: "", description: "" });
const renewalForm = reactive({ contractId: "", expiryDate: "", noticePeriodDays: 30, renewalType: "MANUAL", notes: "" });
const savingObligation = ref(false);
const savingRenewal = ref(false);
const vendors = ref<VendorItem[]>([]);
const vendorForm = reactive({ legalName: "", displayName: "", category: "SUPPLIER", industry: "", country: "", website: "", contactName: "", contactEmail: "" });
const vendorAssessment = reactive({ vendorId: "", score: 20, factors: "" });
const savingVendor = ref(false);
const templates = ref<TemplateItem[]>([]);
const clauses = ref<ClauseItem[]>([]);
const templateForm = reactive({ name: "Mutual NDA", contractType: "NDA", sectionHeading: "Effective date", sectionContent: "This agreement is effective from {{effectiveDate}}. Replace this sample language with approved legal wording.", clauseId: "" });
const templateFields = ref<Array<{ key: string; label: string; type: string; required: boolean; options: string[] }>>([{ key: "effectiveDate", label: "Effective date", type: "DATE", required: true, options: [] }]);
const newTemplateField = reactive({ key: "", label: "", type: "TEXT", required: true, options: "" });
const generationValues = reactive<Record<string, string>>({ effectiveDate: "" });
const clauseForm = reactive({ key: "", title: "", category: "General", body: "" });
const generationForm = reactive({ templateId: "", contractNumber: "", counterparty: "", effectiveDate: "" });
const generatedDraft = ref("");
const intelligenceContractId = ref("");
const intelligenceSource = ref("");
const intelligenceSourceLabel = ref("Pasted contract text");
const intelligenceEngine = ref<"RULE_BASED" | "AI_COMPATIBLE">("RULE_BASED");\nconst comparisonBaseline = ref("");\nconst comparisonCandidate = ref("");\nconst comparisonResult = ref<ContractComparison | null>(null);\nconst comparingContract = ref(false);
const intelligenceReport = ref<IntelligenceReport | null>(null);
const analyzingContract = ref(false);
const savingTemplate = ref(false);
const savingClause = ref(false);
const editingClauseId = ref("");
const workflowForm = reactive({ name: 'Standard contract review', approverUserIds: '' });
const creatingWorkflow = ref(false);
const selectedWorkflowId = ref('');
const form = reactive({ organizationName: "", organizationSlug: "", name: "", email: "", password: "" });
const contractForm = reactive({ title: "", contractNumber: "", type: "MSA", counterparty: "", vendorId: "", currency: "USD", contractValue: "" });

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (auth.accessToken) headers.set("Authorization", `Bearer ${auth.accessToken}`);
  const response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: "include" });
  const result = await response.json() as { success: boolean; data?: T; error?: { message?: string } };
  if (!response.ok || !result.success || result.data === undefined) throw new Error(result.error?.message ?? "The request could not be completed.");
  return result.data;
}

async function loadNotifications() {
  if (!auth.accessToken) return;
  loadingNotifications.value = true;
  try {
    const result = await api<{ items: NotificationItem[]; unread: number }>("/notifications?page=1&limit=20");
    notifications.value = result.items;
    unreadNotifications.value = result.unread;
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not load notifications."; }
  finally { loadingNotifications.value = false; }
}

async function markNotificationRead(item: NotificationItem) {
  if (!item.readAt) {
    try {
      await api(`/notifications/${item._id}/read`, { method: "PATCH" });
      item.readAt = new Date().toISOString();
      unreadNotifications.value = Math.max(0, unreadNotifications.value - 1);
    } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not update notification."; }
  }
}

async function markAllNotificationsRead() {
  try {
    await api("/notifications/read-all", { method: "PATCH" });
    notifications.value = notifications.value.map(item => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }));
    unreadNotifications.value = 0;
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not update notifications."; }
}

async function loadWorkflowData() {
  if (!auth.accessToken) return;
  try {
    const [definitions, tasks] = await Promise.all([
      api<{ definitions: WorkflowDefinition[] }>('/workflows/definitions'),
      api<{ tasks: ApprovalTask[] }>('/workflows/tasks/mine')
    ]);
    workflowDefinitions.value = definitions.definitions;
    approvalTasks.value = tasks.tasks;
    if (!selectedWorkflowId.value && workflowDefinitions.value.length) selectedWorkflowId.value = workflowDefinitions.value[0]?._id ?? "";
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : 'Could not load approval workflows.'; }
}

async function loadObligationsAndRenewals() {
  if (!auth.accessToken) return;
  try {
    const [obligationResult, renewalResult] = await Promise.all([
      api<{ items: ObligationItem[] }>("/obligations?page=1&limit=50"),
      api<{ items: RenewalItem[]; summary: { upcoming: number; noticeDue: number; inProgress: number; expired: number } }>("/obligations/renewals?page=1&limit=50")
    ]);
    obligations.value = obligationResult.items;
    renewals.value = renewalResult.items;
    renewalSummary.value = renewalResult.summary;
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not load obligations and renewals."; }
}

async function loadVendors() {
  if (!auth.accessToken) return;
  try { const result = await api<{ items: VendorItem[] }>("/vendors?page=1&limit=100"); vendors.value = result.items; }
  catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not load vendors."; }
}

async function loadTemplates() {
 if (!auth.accessToken) return;
 try {
  const [templateResult, clauseResult] = await Promise.all([api<{ templates: TemplateItem[] }>("/templates"), api<{ clauses: ClauseItem[] }>("/templates/clauses")]);
  templates.value = templateResult.templates; clauses.value = clauseResult.clauses;
  if (!generationForm.templateId) generationForm.templateId = templates.value.find(item => item.status === "APPROVED")?._id ?? "";
 } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not load templates and clauses."; }
}
function addTemplateField() {
 const key = newTemplateField.key.trim();
 if (!/^[a-z][a-zA-Z0-9_]{1,39}$/.test(key) || templateFields.value.some(field => field.key === key)) {
  errorMessage.value = "Use a unique field key beginning with a lowercase letter (2–40 characters)."; return;
 }
 const options = newTemplateField.options.split(",").map(value => value.trim()).filter(Boolean);
 if (newTemplateField.type === "CHOICE" && !options.length) { errorMessage.value = "Choice fields need at least one comma-separated option."; return; }
 templateFields.value.push({ key, label: newTemplateField.label.trim(), type: newTemplateField.type, required: newTemplateField.required, options: newTemplateField.type === "CHOICE" ? options : [] });
 Object.assign(newTemplateField, { key: "", label: "", type: "TEXT", required: true, options: "" });
 errorMessage.value = "";
}
function removeTemplateField(key: string) {
 if (templateFields.value.length <= 1) return;
 templateFields.value = templateFields.value.filter(field => field.key !== key);
}
function reviseClause(clause: ClauseItem) {
 editingClauseId.value = clause._id;
 Object.assign(clauseForm, { key: clause.key, title: clause.title, category: clause.category, body: clause.body });
}
async function createClause() {
 savingClause.value = true; errorMessage.value = "";
 try {
  if (editingClauseId.value) {
   await api(`/templates/clauses/${editingClauseId.value}`, { method: "PATCH", body: JSON.stringify({ title: clauseForm.title, category: clauseForm.category, body: clauseForm.body }) });
   successMessage.value = "A new clause wording version was created.";
  } else {
   await api("/templates/clauses", { method: "POST", body: JSON.stringify(clauseForm) });
   successMessage.value = "Clause added to the organization library.";
  }
  editingClauseId.value = "";
  Object.assign(clauseForm, { key: "", title: "", category: "General", body: "" });
  await loadTemplates();
 } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not save clause."; } finally { savingClause.value = false; }
}
async function createTemplate() {
 savingTemplate.value = true; errorMessage.value = "";
 try {
  await api("/templates", { method: "POST", body: JSON.stringify({
   name: templateForm.name, contractType: templateForm.contractType,
   fields: templateFields.value,
   sections: [{ heading: templateForm.sectionHeading, content: templateForm.sectionContent, ...(templateForm.clauseId ? { clauseId: templateForm.clauseId } : {}), optional: false }]
  }) });
  successMessage.value = "Draft template created. Submit it for independent approval."; await loadTemplates();
 } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not create template."; } finally { savingTemplate.value = false; }
}
async function templateAction(template: TemplateItem, action: "submit" | "approve" | "revisions") {
 errorMessage.value = "";
 try { await api(`/templates/${template._id}/${action}`, { method: "POST" }); successMessage.value = action === "submit" ? "Template submitted for approval." : action === "approve" ? "Template approved for use." : "New draft revision created."; await loadTemplates(); }
 catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not update template."; }
}
async function generateFromTemplate() {
 errorMessage.value = ""; generatedDraft.value = "";
 try {
  const result = await api<{ contract: ContractSummary; draftContent: string }>(`/templates/${generationForm.templateId}/generate`, { method: "POST", body: JSON.stringify({ contractNumber: generationForm.contractNumber, counterparty: generationForm.counterparty, values: Object.fromEntries(templates.value.find(template => template._id === generationForm.templateId)?.fields.map(field => [field.key, generationValues[field.key] ?? ""]) ?? []) }) });
  generatedDraft.value = result.draftContent; successMessage.value = `Draft ${result.contract.contractNumber} created. Review the wording before approval or signature.`;
  await loadContracts();
 } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not generate contract draft."; }
}
async function createVendor() {
  errorMessage.value = ""; savingVendor.value = true;
  try {
    const contacts = vendorForm.contactName && vendorForm.contactEmail ? [{ name: vendorForm.contactName, email: vendorForm.contactEmail, primary: true }] : [];
    await api("/vendors", { method: "POST", body: JSON.stringify({ legalName: vendorForm.legalName, displayName: vendorForm.displayName || undefined, category: vendorForm.category, industry: vendorForm.industry || undefined, country: vendorForm.country || undefined, website: vendorForm.website || undefined, contacts, aliases: [], tags: [], certifications: [] }) });
    Object.assign(vendorForm, { legalName: "", displayName: "", category: "SUPPLIER", industry: "", country: "", website: "", contactName: "", contactEmail: "" });
    successMessage.value = "Counterparty profile created.";
    await loadVendors();
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not create vendor."; }
  finally { savingVendor.value = false; }
}

async function assessVendor() {
  errorMessage.value = "";
  try {
    await api(`/vendors/${vendorAssessment.vendorId}/assessments`, { method: "POST", body: JSON.stringify({ score: vendorAssessment.score, factors: vendorAssessment.factors.split(",").map(v => v.trim()).filter(Boolean) }) });
    successMessage.value = "Vendor risk assessment recorded.";
    vendorAssessment.factors = "";
    await loadVendors();
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not save vendor assessment."; }
}

async function createObligation() {
  errorMessage.value = ""; savingObligation.value = true;
  try {
    await api("/obligations", { method: "POST", body: JSON.stringify({ ...obligationForm, dueDate: new Date(obligationForm.dueDate).toISOString() }) });
    Object.assign(obligationForm, { contractId: "", title: "", type: "DELIVERABLE", priority: "MEDIUM", dueDate: "", description: "" });
    successMessage.value = "Contractual obligation created.";
    await loadObligationsAndRenewals();
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not create obligation."; }
  finally { savingObligation.value = false; }
}

async function saveRenewal() {
  errorMessage.value = ""; savingRenewal.value = true;
  try {
    await api(`/obligations/renewals/${renewalForm.contractId}`, { method: "PUT", body: JSON.stringify({ ...renewalForm, expiryDate: new Date(renewalForm.expiryDate).toISOString() }) });
    Object.assign(renewalForm, { contractId: "", expiryDate: "", noticePeriodDays: 30, renewalType: "MANUAL", notes: "" });
    successMessage.value = "Renewal schedule saved; notice deadline calculated.";
    await loadObligationsAndRenewals();
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not save renewal schedule."; }
  finally { savingRenewal.value = false; }
}

async function setObligationStatus(item: ObligationItem, status: "COMPLETED" | "IN_PROGRESS" | "CANCELLED") {
  try {
    await api(`/obligations/${item._id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await loadObligationsAndRenewals();
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not update obligation."; }
}

async function updateRenewalStatus(item: RenewalItem, status: "RENEWAL_IN_PROGRESS" | "RENEWED" | "TERMINATED") {
  try {
    await api(`/obligations/renewals/${item._id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    await loadObligationsAndRenewals();
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not update renewal status."; }
}

async function loadContracts() {
  if (!auth.accessToken) return;
  loadingContracts.value = true;
  try {
    const params = new URLSearchParams({ page: "1", limit: "50", sort: "updatedAt", order: "desc" });
    if (search.value.trim()) params.set("q", search.value.trim());
    if (statusFilter.value) params.set("status", statusFilter.value);
    const result = await api<ContractList>(`/contracts?${params.toString()}`);
    contracts.value = result.items;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Could not load contracts.";
  } finally {
    loadingContracts.value = false;
  }
}

onMounted(async () => {
  await auth.restore();
  if (auth.user) {
    if (!workflowForm.approverUserIds) workflowForm.approverUserIds = auth.user.id;
    await Promise.all([loadContracts(), loadWorkflowData(), loadObligationsAndRenewals(), loadVendors(), loadNotifications(), loadTemplates()]);
  }
});

async function submitAuth() {
  errorMessage.value = "";
  try {
    if (mode.value === "register") await auth.register({ ...form });
    else await auth.login({ organizationSlug: form.organizationSlug, email: form.email, password: form.password });
    await Promise.all([loadContracts(), loadWorkflowData(), loadObligationsAndRenewals(), loadVendors(), loadNotifications()]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  }
}

async function createContract() {
  errorMessage.value = "";
  successMessage.value = "";
  creatingContract.value = true;
  try {
    await api("/contracts", {
      method: "POST",
      body: JSON.stringify({
        ...contractForm,
        contractValue: contractForm.contractValue ? Number(contractForm.contractValue) : undefined,
        vendorId: contractForm.vendorId || undefined,
        tags: []
      })
    });
    Object.assign(contractForm, { title: "", contractNumber: "", type: "MSA", counterparty: "", vendorId: "", currency: "USD", contractValue: "" });
    successMessage.value = "Contract record created.";
    await loadContracts();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Could not create the contract.";
  } finally {
    creatingContract.value = false;
  }
}

async function createWorkflow() {
  errorMessage.value = ''; creatingWorkflow.value = true;
  try {
    const approverUserIds = workflowForm.approverUserIds.split(',').map(value => value.trim()).filter(Boolean);
    await api('/workflows/definitions', { method: 'POST', body: JSON.stringify({ name: workflowForm.name, stages: [{ name: 'Approval', approvalMode: 'ALL', approverUserIds }] }) });
    successMessage.value = 'Approval workflow created.'; await loadWorkflowData();
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : 'Could not create workflow.'; }
  finally { creatingWorkflow.value = false; }
}

async function submitForApproval(contract: ContractSummary) {
  if (!selectedWorkflowId.value) { errorMessage.value = 'Create or select an approval workflow first.'; return; }
  errorMessage.value = '';
  try {
    await api(`/workflows/contracts/${contract._id}/submit`, { method: 'POST', body: JSON.stringify({ workflowDefinitionId: selectedWorkflowId.value }) });
    successMessage.value = `${contract.contractNumber} submitted for approval.`;
    await Promise.all([loadContracts(), loadWorkflowData()]);
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : 'Could not submit contract.'; }
}

async function decide(task: ApprovalTask, decision: 'APPROVE' | 'REJECT') {
  errorMessage.value = '';
  try {
    await api(`/workflows/instances/${task._id}/decision`, { method: 'POST', body: JSON.stringify({ decision }) });
    successMessage.value = decision === 'APPROVE' ? 'Approval decision recorded.' : 'Contract rejected and returned to draft.';
    await Promise.all([loadContracts(), loadWorkflowData()]);
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : 'Could not record the decision.'; }
}

async function uploadDocument(contractId: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  errorMessage.value = "";
  successMessage.value = "";
  const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  if (!allowed.includes(file.type)) {
    errorMessage.value = "Choose a PDF or DOCX document.";
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    errorMessage.value = "The maximum document size is 25 MiB.";
    return;
  }
  try {
    const result = await api<{ uploadId: string; uploadUrl: string; method: "PUT"; headers: Record<string, string> }>(`/contracts/${contractId}/uploads`, {
      method: "POST",
      body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: file.size })
    });
    const uploaded = await fetch(result.uploadUrl, { method: result.method, headers: result.headers, body: file });
    if (!uploaded.ok) throw new Error("The document could not be transferred to private storage. Check bucket CORS and storage settings.");
    await api(`/contracts/uploads/${result.uploadId}/complete`, { method: "POST" });
    successMessage.value = `Uploaded ${file.name} as a new contract version.`;
    await loadContracts();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Document upload failed.";
  }
}

async function downloadLatest(contract: ContractSummary) {
  if (!contract.latestDocumentId) return;
  errorMessage.value = "";
  try {
    const result = await api<{ downloadUrl: string; filename: string }>(`/contracts/${contract._id}/versions/${contract.latestDocumentId}/download`);
    const link = document.createElement("a");
    link.href = result.downloadUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Could not prepare document download.";
  }
}

async function analyzeLatestDocument() {
 errorMessage.value = ""; intelligenceReport.value = null; analyzingContract.value = true;
 try {
  const contract = contracts.value.find(item => item._id === intelligenceContractId.value);
  if (!contract?.latestDocumentId) throw new Error("Upload a PDF or DOCX version to this contract first.");
  const result = await api<{ report: IntelligenceReport }>(`/contracts/${contract._id}/intelligence/documents/${contract.latestDocumentId}/analyze`, { method: "POST", body: JSON.stringify({ engine: intelligenceEngine.value }) });
  intelligenceReport.value = result.report;
  successMessage.value = "Stored document review completed. Verify every finding against the source.";
 } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not analyze the stored document."; }
 finally { analyzingContract.value = false; }
}
async function analyzeContractText() {
 errorMessage.value = ""; intelligenceReport.value = null; analyzingContract.value = true;
 try {
  const result = await api<{ report: IntelligenceReport }>(`/contracts/${intelligenceContractId.value}/intelligence/analyze`, { method: "POST", body: JSON.stringify({ sourceText: intelligenceSource.value, sourceLabel: intelligenceSourceLabel.value, engine: intelligenceEngine.value }) });
  intelligenceReport.value = result.report;
  successMessage.value = "Evidence-grounded contract review completed. Verify every finding against the source.";
 } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not analyze contract text."; }
 finally { analyzingContract.value = false; }
}

async function compareContractVersions() {
 errorMessage.value = ""; comparisonResult.value = null; comparingContract.value = true;
 try {
  const result = await api<{ comparison: ContractComparison }>(`/contracts/${intelligenceContractId.value}/intelligence/compare`, {
   method: "POST",
   body: JSON.stringify({ baselineText: comparisonBaseline.value, candidateText: comparisonCandidate.value, baselineLabel: "Earlier version", candidateLabel: "Proposed version" })
  });
  comparisonResult.value = result.comparison;
  successMessage.value = "Version comparison completed. Review every detected change before accepting amendments.";
 } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Could not compare these contract versions."; }
 finally { comparingContract.value = false; }
}
\nasync function signOut() {
  await auth.logout();
  contracts.value = [];
  notifications.value = [];
  unreadNotifications.value = 0;
  notificationsOpen.value = false;
  mode.value = "login";
}
</script>

<template>
  <main class="shell">
    <nav class="topbar">
      <a class="brand" href="/"><span class="brand-mark">C</span><span>Contract<span class="brand-light">Sphere</span></span></a>
      <span class="environment">{{ auth.user ? auth.user.organization.name : "ENTERPRISE CLM PLATFORM" }}</span>
      <div v-if="auth.user" class="notification-area">
        <button class="notification-trigger" type="button" :aria-expanded="notificationsOpen" @click="notificationsOpen = !notificationsOpen; notificationsOpen && loadNotifications()">
          <span aria-hidden="true">♧</span> Notifications <span v-if="unreadNotifications" class="notification-count">{{ unreadNotifications > 99 ? "99+" : unreadNotifications }}</span>
        </button>
        <section v-if="notificationsOpen" class="notification-popover" aria-label="Notifications">
          <div class="notification-heading"><strong>Activity inbox</strong><button type="button" @click="markAllNotificationsRead" :disabled="!unreadNotifications">Mark all read</button></div>
          <div v-if="loadingNotifications" class="notification-empty">Loading notifications…</div>
          <div v-else-if="!notifications.length" class="notification-empty">You're all caught up.</div>
          <button v-for="item in notifications" :key="item._id" type="button" class="notification-item" :class="{ unread: !item.readAt }" @click="markNotificationRead(item)">
            <span class="notification-dot"></span><span class="notification-copy"><strong>{{ item.title }}</strong><small>{{ item.body }}</small><small>{{ new Date(item.createdAt).toLocaleString() }}</small></span>
          </button>
        </section>
      </div>
    </nav>

    <div v-if="!auth.ready" class="loading-state">Preparing your secure workspace…</div>

    <section v-else-if="auth.user" class="workspace">
      <div class="workspace-heading">
        <div>
          <div class="eyebrow"><span class="pulse"></span> ORGANIZATION WORKSPACE</div>
          <h1 class="workspace-title">Contract <span>repository.</span></h1>
          <p class="intro">Manage agreements, keep versions organized, and maintain a searchable record across your organization.</p>
        </div>
        <button class="secondary-button" @click="signOut">Sign out</button>
      </div>

      <div class="metric-grid">
        <div class="metric-card"><span class="metric-label">TOTAL CONTRACTS</span><strong>{{ contracts.length }}</strong><small>Current result set</small></div>
        <div class="metric-card"><span class="metric-label">EXECUTED</span><strong>{{ contracts.filter(item => item.status === 'EXECUTED').length }}</strong><small>Completed agreements</small></div>
        <div class="metric-card"><span class="metric-label">IN REVIEW</span><strong>{{ contracts.filter(item => item.status === 'IN_REVIEW').length }}</strong><small>Awaiting workflow</small></div>
        <div class="metric-card"><span class="metric-label">DOCUMENT VERSIONS</span><strong>{{ contracts.reduce((sum, item) => sum + item.latestVersion, 0) }}</strong><small>Latest version count</small></div>
      </div>

      <div class="metric-grid lifecycle-metrics">
        <div class="metric-card"><span class="metric-label">OPEN OBLIGATIONS</span><strong>{{ obligations.filter(item => !['COMPLETED', 'CANCELLED'].includes(item.status)).length }}</strong><small>Tracked commitments</small></div>
        <div class="metric-card"><span class="metric-label">OVERDUE OBLIGATIONS</span><strong>{{ obligations.filter(item => item.status === 'OVERDUE').length }}</strong><small>Past-due commitments</small></div>
        <div class="metric-card"><span class="metric-label">NOTICE DEADLINES</span><strong>{{ renewalSummary.noticeDue }}</strong><small>Renewal action required</small></div>
        <div class="metric-card"><span class="metric-label">RENEWALS IN PROGRESS</span><strong>{{ renewalSummary.inProgress }}</strong><small>Active renewal work</small></div>
      </div>

      <div v-if="errorMessage" class="error-message global-message" role="alert">{{ errorMessage }}</div>
      <div v-if="successMessage" class="success-message global-message" role="status">{{ successMessage }}</div>


      <section class="panel intelligence-panel">
        <div class="panel-heading"><div><span class="eyebrow">CONTRACT INTELLIGENCE · RULE-BASED BASELINE</span><h2>Evidence-grounded review</h2></div><span class="count-chip">Human review required</span></div>
        <form @submit.prevent="analyzeContractText">
          <label>Contract<select v-model="intelligenceContractId" required><option value="" disabled>Select a contract</option><option v-for="contract in contracts" :key="contract._id" :value="contract._id">{{ contract.contractNumber }} · {{ contract.title }}</option></select></label>
          <label>Analysis engine<select v-model="intelligenceEngine"><option value="RULE_BASED">Rules-based (local processing)</option><option value="AI_COMPATIBLE">Configured AI provider (sends text externally)</option></select></label>
          <p v-if="intelligenceEngine === 'AI_COMPATIBLE'" class="field-hint">Contract text will be sent to your configured AI provider. Confirm your organization's data-processing approval before proceeding.</p>
          <label>Source label<input v-model="intelligenceSourceLabel" required maxlength="120"/></label>
          <label>Paste contract text<textarea v-model="intelligenceSource" required minlength="100" maxlength="30000" rows="7" placeholder="Paste the agreement text to review (100–30,000 characters)…"></textarea></label>
          <p class="field-hint">This baseline uses deterministic checks, not a generative AI model. The complete source text is not retained; reports store evidence excerpts and a SHA-256 fingerprint.</p>
          <div class="form-row"><button class="primary-button" type="submit" :disabled="analyzingContract || !intelligenceContractId || intelligenceSource.trim().length < 100">{{ analyzingContract ? "Reviewing…" : "Analyze pasted text" }}</button><button class="refresh-button" type="button" :disabled="analyzingContract || !contracts.find(item => item._id === intelligenceContractId)?.latestDocumentId" @click="analyzeLatestDocument">Analyze latest PDF/DOCX</button></div>
        </form>
        
        <div class="comparison-workspace">
          <div class="panel-heading"><div><span class="eyebrow">NEGOTIATION INTELLIGENCE</span><h2>Compare contract versions</h2></div><span class="count-chip">Evidence-led change review</span></div>
          <form @submit.prevent="compareContractVersions">
            <label>Earlier / baseline version<textarea v-model="comparisonBaseline" required minlength="100" maxlength="30000" rows="5" placeholder="Paste the earlier agreement text…"></textarea></label>
            <label>Proposed / candidate version<textarea v-model="comparisonCandidate" required minlength="100" maxlength="30000" rows="5" placeholder="Paste the proposed agreement text…"></textarea></label>
            <button class="primary-button" type="submit" :disabled="comparingContract || !intelligenceContractId || comparisonBaseline.trim().length < 100 || comparisonCandidate.trim().length < 100">{{ comparingContract ? "Comparing versions…" : "Compare versions and assess risk changes" }}</button>
          </form>
          <p class="field-hint">Comparison uses deterministic sentence and clause matching. It highlights review candidates, not legally validated redlines. Text is not retained; only fingerprints and limited excerpts are saved.</p>
          <div v-if="comparisonResult" class="comparison-results">
            <div class="metric-grid">
              <div class="metric-card"><span class="metric-label">TEXT SIMILARITY</span><strong>{{ comparisonResult.similarityScore }}%</strong><small>Sentence-set overlap indicator</small></div>
              <div class="metric-card"><span class="metric-label">CLAUSES ADDED</span><strong>{{ comparisonResult.clauseChanges.filter(item => item.change === 'ADDED').length }}</strong><small>Newly detected categories</small></div>
              <div class="metric-card"><span class="metric-label">CLAUSES REMOVED</span><strong>{{ comparisonResult.clauseChanges.filter(item => item.change === 'REMOVED').length }}</strong><small>Previously detected categories</small></div>
              <div class="metric-card"><span class="metric-label">RISK CHANGES</span><strong>{{ comparisonResult.findingChanges.length }}</strong><small>New, resolved or changed flags</small></div>
            </div>
            <p class="panel-note">{{ comparisonResult.summary }}</p>
            <h3>Clause-level changes</h3>
            <div class="definition-list"><article v-for="item in comparisonResult.clauseChanges.filter(change => change.change !== 'UNCHANGED')" :key="item.key" class="definition-row"><div class="vendor-title"><strong>{{ item.label }}</strong><span class="status-pill" :class="item.change.toLowerCase()">{{ item.change }}</span></div><small v-if="item.baselineEvidence">Earlier: {{ item.baselineEvidence }}</small><small v-if="item.candidateEvidence">Proposed: {{ item.candidateEvidence }}</small></article><p v-if="!comparisonResult.clauseChanges.some(item => item.change !== 'UNCHANGED')" class="panel-note">No clause category changes detected.</p></div>
            <h3>Risk movement</h3>
            <div class="definition-list"><article v-for="item in comparisonResult.findingChanges" :key="item.key" class="definition-row"><div class="vendor-title"><strong>{{ item.title }}</strong><span class="status-pill" :class="item.change.toLowerCase()">{{ item.change }}</span></div><small>Earlier: {{ item.baselineSeverity || '—' }} · Proposed: {{ item.candidateSeverity || '—' }}</small></article><p v-if="!comparisonResult.findingChanges.length" class="panel-note">No changes to the detected risk flags.</p></div>
            <div class="form-row"><div><h3>Detected additions</h3><article v-for="(item, index) in comparisonResult.additions" :key="'add-' + index" class="change-excerpt">{{ item.excerpt }}</article></div><div><h3>Detected removals</h3><article v-for="(item, index) in comparisonResult.removals" :key="'remove-' + index" class="change-excerpt removed">{{ item.excerpt }}</article></div></div>
          </div>
        </div>
        <div v-if="intelligenceReport" class="intelligence-results">
          <p class="panel-note">{{ intelligenceReport.summary }}</p>
          <div class="metric-grid"><div v-for="severity in ['CRITICAL','HIGH','MEDIUM','LOW']" :key="severity" class="metric-card"><span class="metric-label">{{ severity }} FLAGS</span><strong>{{ intelligenceReport.riskCounts[severity] ?? 0 }}</strong></div></div>
          <h3>Review findings</h3>
          <article v-for="finding in intelligenceReport.findings" :key="finding.key" class="definition-row">
            <div class="vendor-title"><strong>{{ finding.title }}</strong><span class="status-pill" :class="finding.severity.toLowerCase()">{{ finding.severity }}</span></div>
            <small>{{ finding.category }} · confidence {{ Math.round(finding.confidence * 100) }}%</small><p>{{ finding.explanation }}</p>
            <blockquote v-if="finding.evidence" class="intelligence-evidence">“{{ finding.evidence.excerpt }}”<small>Source characters {{ finding.evidence.start }}–{{ finding.evidence.end }}</small></blockquote>
          </article>
          <h3>Clause coverage</h3><div class="definition-list"><div v-for="clause in intelligenceReport.extractedClauses" :key="clause.key" class="definition-row"><strong>{{ clause.label }}</strong><small>{{ clause.found ? "Detected in source" : "Not detected" }}</small></div></div>
          <p class="field-hint">Not detected does not prove absence. Findings can be incomplete or incorrect and are not legal advice. Review the original agreement with qualified counsel.</p>
        </div>
      </section>

      <section class="workflow-grid">
        <div class="panel workflow-panel">
          <div class="panel-heading"><div><span class="eyebrow">WORKFLOW DESIGN</span><h2>Approval routes</h2></div><span class="panel-number">02</span></div>
          <div v-if="auth.user.role === 'OWNER' || auth.user.role === 'ADMIN'">
            <form @submit.prevent="createWorkflow">
              <label>Workflow name<input v-model="workflowForm.name" required minlength="3" maxlength="120" placeholder="Standard contract review"/></label>
              <label>Approver user IDs<input v-model="workflowForm.approverUserIds" required placeholder="Comma-separated MongoDB user IDs"/></label>
              <p class="field-hint">For a first test, use your own user ID. The API supports multiple sequential stages and ALL/ANY approval.</p>
              <button class="primary-button" type="submit" :disabled="creatingWorkflow">{{ creatingWorkflow ? "Creating…" : "Create one-stage workflow" }}</button>
            </form>
          </div>
          <div class="definition-list" v-if="workflowDefinitions.length">
            <label>Workflow for submission<select v-model="selectedWorkflowId"><option v-for="definition in workflowDefinitions" :key="definition._id" :value="definition._id">{{ definition.name }} · {{ definition.stages.length }} stages</option></select></label>
            <div v-for="definition in workflowDefinitions" :key="definition._id" class="definition-row"><strong>{{ definition.name }}</strong><small>{{ definition.stages.map(stage => stage.name + ' (' + stage.approvalMode + ')').join(' → ') }}</small></div>
          </div>
          <p v-else class="panel-note">No approval workflow has been configured yet.</p>
        </div>
        <div class="panel workflow-panel">
          <div class="panel-heading"><div><span class="eyebrow">MY WORK QUEUE</span><h2>Pending approvals <span class="count-chip">{{ approvalTasks.length }}</span></h2></div><button class="refresh-button" @click="loadWorkflowData">↻ Refresh</button></div>
          <div v-if="approvalTasks.length" class="task-list">
            <article v-for="task in approvalTasks" :key="task._id" class="task-row">
              <div class="task-copy"><strong>{{ task.contract?.title ?? 'Contract review' }}</strong><small>{{ task.contract?.contractNumber }} · {{ task.contract?.counterparty }}</small><small>{{ task.definitionName }} / {{ task.currentStage.name }} · {{ task.currentStage.approvalMode }} approval</small></div>
              <div class="task-actions"><button class="approve-button" @click="decide(task, 'APPROVE')">Approve</button><button class="reject-button" @click="decide(task, 'REJECT')">Reject</button></div>
            </article>
          </div>
          <div v-else class="empty-state compact-empty">No approvals are currently assigned to you.</div>
        </div>
      </section>

      <section class="obligation-grid">
        <div class="panel workflow-panel">
          <div class="panel-heading"><div><span class="eyebrow">COMMITMENT TRACKING</span><h2>Obligations <span class="count-chip">{{ obligations.length }}</span></h2></div><button class="refresh-button" @click="loadObligationsAndRenewals">↻ Refresh</button></div>
          <form @submit.prevent="createObligation">
            <label>Related contract<select v-model="obligationForm.contractId" required><option value="" disabled>Select a contract</option><option v-for="contract in contracts" :key="contract._id" :value="contract._id">{{ contract.contractNumber }} · {{ contract.title }}</option></select></label>
            <label>Obligation title<input v-model="obligationForm.title" required minlength="2" maxlength="180" placeholder="Deliver quarterly compliance report"/></label>
            <div class="form-row">
              <label>Type<select v-model="obligationForm.type"><option>PAYMENT</option><option>DELIVERABLE</option><option>SLA</option><option>COMPLIANCE</option><option>NOTICE</option><option>OTHER</option></select></label>
              <label>Priority<select v-model="obligationForm.priority"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label>
            </div>
            <label>Due date<input v-model="obligationForm.dueDate" type="date" required/></label>
            <label>Description<input v-model="obligationForm.description" maxlength="2000" placeholder="Optional details"/></label>
            <button class="primary-button" type="submit" :disabled="savingObligation || !contracts.length">{{ savingObligation ? "Saving…" : "Add obligation" }}</button>
          </form>
          <div v-if="obligations.length" class="definition-list">
            <article v-for="item in obligations" :key="item._id" class="definition-row">
              <div class="task-row">
                <div class="task-copy"><strong>{{ item.title }}</strong><small>{{ typeof item.contractId === 'object' ? item.contractId.contractNumber : '' }} · {{ item.type }} · {{ item.priority }} · Due {{ new Date(item.dueDate).toLocaleDateString() }}</small><small>{{ item.status.replace('_', ' ') }}</small></div>
                <div class="task-actions"><button v-if="item.status === 'COMPLETED' || item.status === 'CANCELLED'" class="approve-button" @click="setObligationStatus(item, 'IN_PROGRESS')">Reopen</button><template v-else><button class="approve-button" @click="setObligationStatus(item, 'COMPLETED')">Complete</button><button class="reject-button" @click="setObligationStatus(item, 'CANCELLED')">Cancel</button></template></div>
              </div>
            </article>
          </div>
          <p v-else class="panel-note">No contractual obligations recorded yet.</p>
        </div>
        <div class="panel workflow-panel">
          <div class="panel-heading"><div><span class="eyebrow">EXPIRATION CONTROL</span><h2>Renewal calendar <span class="count-chip">{{ renewals.length }}</span></h2></div></div>
          <form @submit.prevent="saveRenewal">
            <label>Related contract<select v-model="renewalForm.contractId" required><option value="" disabled>Select a contract</option><option v-for="contract in contracts" :key="contract._id" :value="contract._id">{{ contract.contractNumber }} · {{ contract.title }}</option></select></label>
            <label>Expiry date<input v-model="renewalForm.expiryDate" type="date" required/></label>
            <div class="form-row">
              <label>Notice period (days)<input v-model.number="renewalForm.noticePeriodDays" type="number" min="0" max="3650" required/></label>
              <label>Renewal type<select v-model="renewalForm.renewalType"><option value="MANUAL">Manual</option><option value="AUTO">Automatic</option><option value="NONE">No renewal</option></select></label>
            </div>
            <label>Notes<input v-model="renewalForm.notes" maxlength="2000" placeholder="Optional renewal context"/></label>
            <button class="primary-button" type="submit" :disabled="savingRenewal">{{ savingRenewal ? "Saving…" : "Save renewal schedule" }}</button>
          </form>
          <div class="definition-list">
            <article v-for="item in renewals" :key="item._id" class="definition-row"><strong>{{ item.contractId?.contractNumber }} · {{ item.contractId?.title }}</strong><small>{{ item.status.replace('_', ' ') }} · Notice by {{ new Date(item.noticeDeadline).toLocaleDateString() }} · Expires {{ new Date(item.expiryDate).toLocaleDateString() }}</small><div v-if="!['RENEWED', 'TERMINATED', 'EXPIRED'].includes(item.status)" class="task-actions"><button class="submit-action" @click="updateRenewalStatus(item, 'RENEWAL_IN_PROGRESS')">Start</button><button class="approve-button" @click="updateRenewalStatus(item, 'RENEWED')">Renewed</button><button class="reject-button" @click="updateRenewalStatus(item, 'TERMINATED')">Terminate</button></div></article>
            <p v-if="!renewals.length" class="panel-note">Set an expiry date and notice period to begin tracking renewals.</p>
          </div>
        </div>
      </section>


      <section class="template-grid">
        <div class="panel workflow-panel">
          <div class="panel-heading"><div><span class="eyebrow">STANDARD LANGUAGE</span><h2>Clause library <span class="count-chip">{{ clauses.length }}</span></h2></div><button class="refresh-button" @click="loadTemplates">↻ Refresh</button></div>
          <form @submit.prevent="createClause">
            <label>Clause key<input v-model="clauseForm.key" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="80" placeholder="limitation-of-liability" :disabled="!!editingClauseId"/></label>
            <div class="form-row"><label>Clause title<input v-model="clauseForm.title" required minlength="2" maxlength="160" placeholder="Limitation of liability"/></label><label>Category<input v-model="clauseForm.category" required maxlength="80" placeholder="Risk"/></label></div>
            <label>Reusable wording<textarea v-model="clauseForm.body" required rows="4" maxlength="20000" placeholder="Enter reusable clause language…"></textarea></label>
            <button class="primary-button" type="submit" :disabled="savingClause">{{ savingClause ? "Saving…" : editingClauseId ? "Save new wording version" : "Add clause v1" }}</button><button v-if="editingClauseId" class="refresh-button" type="button" @click="editingClauseId = ''; Object.assign(clauseForm, { key: '', title: '', category: 'General', body: '' })">Cancel revision</button>
          </form>
          <div class="definition-list"><article v-for="clause in clauses" :key="clause._id" class="definition-row"><strong>{{ clause.title }} <span class="count-chip">v{{ clause.version }}</span></strong><small>{{ clause.category }} · {{ clause.key }}</small><p>{{ clause.body }}</p><button class="refresh-button" type="button" @click="reviseClause(clause)">Create next version</button></article><p v-if="!clauses.length" class="panel-note">Create reusable clauses to pin their wording into approved templates.</p></div>
        </div>
        <div class="panel workflow-panel">
          <div class="panel-heading"><div><span class="eyebrow">GOVERNED AGREEMENTS</span><h2>Template studio <span class="count-chip">{{ templates.length }}</span></h2></div></div>
          <form @submit.prevent="createTemplate">
            <label>Template name<input v-model="templateForm.name" required minlength="3" maxlength="160"/></label>
            <div class="form-row"><label>Agreement type<select v-model="templateForm.contractType"><option>NDA</option><option>MSA</option><option>SOW</option><option>SUPPLIER</option><option>EMPLOYMENT</option><option>LEASE</option><option>DPA</option><option>OTHER</option></select></label><label>Section heading<input v-model="templateForm.sectionHeading" required maxlength="160"/></label></div>
            <label>Section wording<textarea v-model="templateForm.sectionContent" required rows="3" maxlength="20000"/></label>
            <label>Pin clause version (optional)<select v-model="templateForm.clauseId"><option value="">Use section wording above</option><option v-for="clause in clauses" :key="clause._id" :value="clause._id">{{ clause.title }} · v{{ clause.version }}</option></select></label>
            <div class="field-hint"><strong>Dynamic fields</strong><p v-for="field in templateFields" :key="field.key">{{ field.label }} · {{ field.key }} · {{ field.type }} · {{ field.required ? "Required" : "Optional" }} <button v-if="templateFields.length > 1" class="refresh-button" type="button" @click="removeTemplateField(field.key)">Remove</button></p></div>
            <div class="form-row"><label>Field key<input v-model="newTemplateField.key" required pattern="[a-z][a-zA-Z0-9_]{1,39}" maxlength="40" placeholder="governingLaw"/></label><label>Field label<input v-model="newTemplateField.label" required minlength="2" maxlength="100" placeholder="Governing law"/></label></div>
            <div class="form-row"><label>Field type<select v-model="newTemplateField.type"><option>TEXT</option><option>DATE</option><option>NUMBER</option><option>EMAIL</option><option>CHOICE</option></select></label><label v-if="newTemplateField.type === 'CHOICE'">Choice options<input v-model="newTemplateField.options" required placeholder="India, Singapore, England"/></label></div>
            <label class="field-hint"><input v-model="newTemplateField.required" type="checkbox"/> Required field</label>
            <button class="refresh-button" type="button" @click="addTemplateField">Add dynamic field</button>
            <p class="field-hint">Use each field key as a placeholder in section wording, for example: double braces, effectiveDate, double braces.</p>
            <button class="primary-button" type="submit" :disabled="savingTemplate">{{ savingTemplate ? "Saving…" : "Create draft template" }}</button>
          </form>
          <div class="definition-list"><article v-for="template in templates" :key="template._id" class="definition-row"><div class="vendor-title"><strong>{{ template.name }} · v{{ template.version }}</strong><span class="status-pill" :class="template.status.toLowerCase()">{{ template.status.replace("_", " ") }}</span></div><small>{{ template.contractType }} · {{ template.fields.length }} dynamic fields · {{ template.sections.length }} sections</small><div class="task-actions"><button v-if="template.status === 'DRAFT'" class="submit-action" @click="templateAction(template, 'submit')">Submit for approval</button><button v-if="template.status === 'PENDING_APPROVAL'" class="approve-button" @click="templateAction(template, 'approve')">Approve</button><button v-if="template.status === 'APPROVED'" class="submit-action" @click="templateAction(template, 'revisions')">New revision</button></div></article><p v-if="!templates.length" class="panel-note">No templates created yet. A different owner or administrator must approve each draft.</p></div>
        </div>
        <div class="panel workflow-panel template-generate">
          <div class="panel-heading"><div><span class="eyebrow">DRAFT GENERATION</span><h2>Generate from approved template</h2></div></div>
          <form @submit.prevent="generateFromTemplate">
            <label>Approved template<select v-model="generationForm.templateId" required><option value="" disabled>Select approved template</option><option v-for="template in templates.filter(item => item.status === 'APPROVED')" :key="template._id" :value="template._id">{{ template.name }} · v{{ template.version }}</option></select></label>
            <div class="form-row"><label>Contract number<input v-model="generationForm.contractNumber" required minlength="2" maxlength="60" placeholder="NDA-2026-001"/></label><label>Counterparty<input v-model="generationForm.counterparty" required minlength="2" maxlength="160" placeholder="Northstar Ltd"/></label></div>
            <label v-for="field in (templates.find(item => item._id === generationForm.templateId)?.fields ?? [])" :key="field.key">{{ field.label }}<select v-if="field.type === 'CHOICE'" v-model="generationValues[field.key]" :required="field.required"><option value="">Select {{ field.label }}</option><option v-for="option in field.options" :key="option" :value="option">{{ option }}</option></select><input v-else v-model="generationValues[field.key]" :type="field.type === 'DATE' ? 'date' : field.type === 'NUMBER' ? 'number' : field.type === 'EMAIL' ? 'email' : 'text'" :required="field.required" :step="field.type === 'NUMBER' ? 'any' : undefined"/></label>
            <button class="primary-button" type="submit" :disabled="!generationForm.templateId">Generate draft contract</button>
          </form>
          <pre v-if="generatedDraft" class="generated-draft">{{ generatedDraft }}</pre>
          <p class="field-hint">Generated agreements remain DRAFT. Legal review is required; this does not approve, execute, or sign contracts.</p>
        </div>
      </section>

      <section class="vendor-grid">
        <div class="panel workflow-panel">
          <div class="panel-heading"><div><span class="eyebrow">COUNTERPARTY DIRECTORY</span><h2>Vendor intelligence <span class="count-chip">{{ vendors.length }}</span></h2></div><button class="refresh-button" @click="loadVendors">↻ Refresh</button></div>
          <form @submit.prevent="createVendor">
            <label>Legal entity name<input v-model="vendorForm.legalName" required minlength="2" maxlength="180" placeholder="Acme Technologies Pvt Ltd"/></label>
            <label>Display name<input v-model="vendorForm.displayName" maxlength="120" placeholder="Acme Technologies"/></label>
            <div class="form-row"><label>Category<select v-model="vendorForm.category"><option>SUPPLIER</option><option>SERVICE_PROVIDER</option><option>CUSTOMER</option><option>PARTNER</option><option>CONSULTANT</option><option>OTHER</option></select></label><label>Industry<input v-model="vendorForm.industry" maxlength="100" placeholder="Technology"/></label></div>
            <div class="form-row"><label>Country<input v-model="vendorForm.country" maxlength="100" placeholder="India"/></label><label>Website<input v-model="vendorForm.website" type="url" placeholder="https://example.com"/></label></div>
            <div class="form-row"><label>Primary contact<input v-model="vendorForm.contactName" placeholder="Contact name"/></label><label>Contact email<input v-model="vendorForm.contactEmail" type="email" placeholder="contact@example.com"/></label></div>
            <button class="primary-button" type="submit" :disabled="savingVendor">{{ savingVendor ? "Saving…" : "Create counterparty profile" }}</button>
          </form>
          <div class="definition-list">
            <article v-for="vendor in vendors" :key="vendor._id" class="definition-row">
              <div class="vendor-title"><strong>{{ vendor.displayName || vendor.legalName }}</strong><span class="risk-pill" :class="vendor.riskLevel.toLowerCase()">{{ vendor.riskLevel }} · {{ vendor.riskScore }}/100</span></div>
              <small>{{ vendor.category.replace('_', ' ') }} · {{ vendor.industry || 'Industry not set' }} · {{ vendor.country || 'Country not set' }} · {{ vendor.status }}</small>
              <small>{{ vendor.contacts.length }} contacts · {{ vendor.certifications.length }} compliance records</small>
            </article>
            <p v-if="!vendors.length" class="panel-note">No counterparties registered yet.</p>
          </div>
        </div>
        <div class="panel workflow-panel">
          <div class="panel-heading"><div><span class="eyebrow">THIRD-PARTY RISK</span><h2>Risk assessment</h2></div><span class="panel-number">04</span></div>
          <form @submit.prevent="assessVendor">
            <label>Counterparty<select v-model="vendorAssessment.vendorId" required><option value="" disabled>Select vendor</option><option v-for="vendor in vendors" :key="vendor._id" :value="vendor._id">{{ vendor.legalName }}</option></select></label>
            <label>Risk score (0–100)<input v-model.number="vendorAssessment.score" type="number" min="0" max="100" required/></label>
            <label>Risk factors<input v-model="vendorAssessment.factors" placeholder="Data access, sanctions review, financial exposure"/></label>
            <p class="field-hint">Risk bands are calculated from the reviewed score: 0–29 low, 30–59 medium, 60–79 high, 80–100 critical. Assessments are human-entered, not automated screening.</p>
            <button class="primary-button" type="submit" :disabled="!vendors.length || !vendorAssessment.vendorId">Record risk assessment</button>
          </form>
          <div class="definition-list">
            <article class="definition-row"><strong>Linked contract coverage</strong><small>Choose a vendor while creating a contract to connect it to the counterparty profile and its portfolio overview API.</small></article>
            <article class="definition-row"><strong>Compliance expiry visibility</strong><small>Certification records retain expiry dates and expose expired status in the vendor API.</small></article>
          </div>
        </div>
      </section>

      <div class="repository-layout">
        <section class="panel create-panel">
          <div class="panel-heading"><div><span class="eyebrow">NEW RECORD</span><h2>Add a contract</h2></div><span class="panel-number">01</span></div>
          <form @submit.prevent="createContract">
            <label>Contract title<input v-model="contractForm.title" required minlength="2" maxlength="200" placeholder="Master Services Agreement"/></label>
            <div class="form-row">
              <label>Contract number<input v-model="contractForm.contractNumber" required minlength="2" maxlength="60" placeholder="MSA-2026-001"/></label>
              <label>Agreement type<select v-model="contractForm.type"><option value="MSA">MSA</option><option value="NDA">NDA</option><option value="SOW">SOW</option><option value="SUPPLIER">Supplier</option><option value="EMPLOYMENT">Employment</option><option value="LEASE">Lease</option><option value="DPA">DPA</option><option value="OTHER">Other</option></select></label>
            </div>
            <label>Counterparty<input v-model="contractForm.counterparty" required minlength="2" maxlength="160" placeholder="Company or individual"/></label>
            <div class="form-row">
              <label>Currency<input v-model="contractForm.currency" required minlength="3" maxlength="3" placeholder="USD"/></label>
              <label>Contract value<input v-model="contractForm.contractValue" type="number" min="0" step="0.01" placeholder="Optional"/></label>
            </div>
            <button class="primary-button" type="submit" :disabled="creatingContract">{{ creatingContract ? "Creating…" : "Create contract record" }}</button>
          </form>
          <p class="panel-note">New records begin in DRAFT and are scoped to your organization.</p>
        </section>

        <section class="panel list-panel">
          <div class="panel-heading list-heading">
            <div><span class="eyebrow">AGREEMENT INDEX</span><h2>All contracts <span class="count-chip">{{ contracts.length }}</span></h2></div>
            <button class="refresh-button" @click="loadContracts" :disabled="loadingContracts">{{ loadingContracts ? "Loading…" : "↻ Refresh" }}</button>
          </div>
          <div class="filters">
            <input v-model="search" aria-label="Search contracts" placeholder="Search title, counterparty, number…" @keyup.enter="loadContracts"/>
            <select v-model="statusFilter" aria-label="Filter by status" @change="loadContracts"><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="IN_REVIEW">In review</option><option value="APPROVED">Approved</option><option value="EXECUTED">Executed</option><option value="EXPIRED">Expired</option><option value="TERMINATED">Terminated</option><option value="ARCHIVED">Archived</option></select>
            <button class="search-button" @click="loadContracts">Search</button>
          </div>
          <div v-if="loadingContracts" class="empty-state">Loading contract records…</div>
          <div v-else-if="contracts.length === 0" class="empty-state"><span class="empty-icon">⌕</span><strong>No contracts found</strong><p>Create your first contract record or adjust the search filters.</p></div>
          <div v-else class="contract-list">
            <article v-for="contract in contracts" :key="contract._id" class="contract-row">
              <div class="contract-icon">DOC</div>
              <div class="contract-main">
                <div class="contract-title-line"><strong>{{ contract.title }}</strong><span :class="['status-pill', contract.status.toLowerCase()]">{{ contract.status.replace('_', ' ') }}</span></div>
                <p>{{ contract.contractNumber }} <span class="dot-separator">·</span> {{ contract.counterparty }}</p>
                <small>{{ contract.type }} <span class="dot-separator">·</span> {{ contract.latestVersion ? 'Version ' + contract.latestVersion : 'No document uploaded' }} <span class="dot-separator">·</span> {{ contract.currency }} {{ contract.contractValue?.toLocaleString() ?? '—' }}</small>
              </div>
              <div class="contract-actions">
                <label class="upload-action" :for="'upload-' + contract._id">Upload version<input :id="'upload-' + contract._id" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="uploadDocument(contract._id, $event)"/></label>
                <button v-if="contract.status === 'DRAFT' && workflowDefinitions.length" class="submit-action" @click="submitForApproval(contract)">Submit for approval</button>
                <button v-if="contract.latestDocumentId" class="download-action" @click="downloadLatest(contract)">Download</button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </section>

    <section v-else class="auth-layout">
      <div class="hero-copy">
        <div class="eyebrow"><span class="pulse"></span> CONTRACT LIFECYCLE INTELLIGENCE</div>
        <h1>Agreements deserve<br/><span>better intelligence.</span></h1>
        <p class="intro">One secure workspace to manage contracts from first draft to final obligation. Built for legal, procurement, finance, and the teams moving business forward.</p>
        <div class="feature-line"><span>01</span> Centralized contract operations</div>
        <div class="feature-line"><span>02</span> Accountable approvals and ownership</div>
        <div class="feature-line"><span>03</span> Intelligence grounded in evidence</div>
      </div>
      <section class="auth-card" aria-label="Account access">
        <div class="auth-tabs">
          <button :class="{ active: mode === 'login' }" @click="mode = 'login'; errorMessage = ''">Sign in</button>
          <button :class="{ active: mode === 'register' }" @click="mode = 'register'; errorMessage = ''">Create workspace</button>
        </div>
        <div class="auth-heading">
          <span class="eyebrow">{{ mode === 'login' ? 'WELCOME BACK' : 'GET STARTED' }}</span>
          <h2>{{ mode === 'login' ? 'Sign in to your workspace' : 'Create your organization' }}</h2>
          <p>{{ mode === 'login' ? 'Enter your organization and account details.' : 'Your account will be the first organization owner.' }}</p>
        </div>
        <form @submit.prevent="submitAuth">
          <label v-if="mode === 'register'">Organization name<input v-model="form.organizationName" required minlength="2" maxlength="120" placeholder="Acme Legal Group"/></label>
          <label>Organization URL slug<input v-model="form.organizationSlug" required minlength="3" maxlength="48" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="acme-legal"/></label>
          <label v-if="mode === 'register'">Your full name<input v-model="form.name" required minlength="2" maxlength="100" placeholder="Avery Morgan"/></label>
          <label>Email address<input v-model="form.email" required type="email" autocomplete="email" placeholder="you@company.com"/></label>
          <label>Password<input v-model="form.password" required type="password" :minlength="mode === 'register' ? 12 : 1" maxlength="128" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" placeholder="Enter your password"/></label>
          <p v-if="mode === 'register'" class="field-hint">Use at least 12 characters, including uppercase, lowercase, and a number.</p>
          <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
          <button class="primary-button" type="submit" :disabled="auth.busy">{{ auth.busy ? "Please wait…" : mode === "login" ? "Sign in securely" : "Create workspace" }}</button>
        </form>
        <p class="auth-footnote">Protected sessions · Organization-scoped accounts</p>
      </section>
    </section>
    <footer><span>CONTRACTSPHERE</span><span>SECURE BY DESIGN · BUILT FOR ENTERPRISE</span></footer>
  </main>
</template>
