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
const auth = useAuthStore();
const mode = ref<"login" | "register">("login");
const errorMessage = ref("");
const successMessage = ref("");
const loadingContracts = ref(false);
const creatingContract = ref(false);
const contracts = ref<ContractSummary[]>([]);
const search = ref("");
const statusFilter = ref("");
const form = reactive({ organizationName: "", organizationSlug: "", name: "", email: "", password: "" });
const contractForm = reactive({ title: "", contractNumber: "", type: "MSA", counterparty: "", currency: "USD", contractValue: "" });

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (auth.accessToken) headers.set("Authorization", `Bearer ${auth.accessToken}`);
  const response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: "include" });
  const result = await response.json() as { success: boolean; data?: T; error?: { message?: string } };
  if (!response.ok || !result.success || result.data === undefined) throw new Error(result.error?.message ?? "The request could not be completed.");
  return result.data;
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
  if (auth.user) await loadContracts();
});

async function submitAuth() {
  errorMessage.value = "";
  try {
    if (mode.value === "register") await auth.register({ ...form });
    else await auth.login({ organizationSlug: form.organizationSlug, email: form.email, password: form.password });
    await loadContracts();
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
        tags: []
      })
    });
    Object.assign(contractForm, { title: "", contractNumber: "", type: "MSA", counterparty: "", currency: "USD", contractValue: "" });
    successMessage.value = "Contract record created.";
    await loadContracts();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Could not create the contract.";
  } finally {
    creatingContract.value = false;
  }
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

async function signOut() {
  await auth.logout();
  contracts.value = [];
  mode.value = "login";
}
</script>

<template>
  <main class="shell">
    <nav class="topbar">
      <a class="brand" href="/"><span class="brand-mark">C</span><span>Contract<span class="brand-light">Sphere</span></span></a>
      <span class="environment">{{ auth.user ? auth.user.organization.name : "ENTERPRISE CLM PLATFORM" }}</span>
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

      <div v-if="errorMessage" class="error-message global-message" role="alert">{{ errorMessage }}</div>
      <div v-if="successMessage" class="success-message global-message" role="status">{{ successMessage }}</div>

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
