<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useAuthStore } from "./stores/auth.store";

const auth = useAuthStore();
const mode = ref<"login" | "register">("login");
const errorMessage = ref("");
const form = reactive({ organizationName: "", organizationSlug: "", name: "", email: "", password: "" });

onMounted(() => { void auth.restore(); });

async function submit() {
  errorMessage.value = "";
  try {
    if (mode.value === "register") {
      await auth.register({ ...form });
    } else {
      await auth.login({ organizationSlug: form.organizationSlug, email: form.email, password: form.password });
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  }
}

async function signOut() {
  await auth.logout();
  mode.value = "login";
}
</script>

<template>
  <main class="shell">
    <nav class="topbar">
      <a class="brand" href="/"><span class="brand-mark">C</span><span>Contract<span class="brand-light">Sphere</span></span></a>
      <span class="environment">ENTERPRISE CLM PLATFORM</span>
    </nav>

    <section v-if="auth.user" class="workspace">
      <div class="eyebrow"><span class="pulse"></span> SECURE WORKSPACE</div>
      <h1>Welcome,<br/><span>{{ auth.user.name }}.</span></h1>
      <p class="intro">You are signed in to <strong>{{ auth.user.organization.name }}</strong>. Your organization workspace is ready for the next ContractSphere modules.</p>
      <div class="status-card">
        <div><span class="status-label">ORGANIZATION</span><strong>{{ auth.user.organization.slug }}</strong></div>
        <span class="status-pill online"><i></i>{{ auth.user.role }}</span>
      </div>
      <button class="secondary-button" @click="signOut">Sign out</button>
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
        <form @submit.prevent="submit">
          <label v-if="mode === 'register'">Organization name<input v-model="form.organizationName" required minlength="2" maxlength="120" placeholder="Acme Legal Group"/></label>
          <label>Organization URL slug<input v-model="form.organizationSlug" required minlength="3" maxlength="48" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="acme-legal"/></label>
          <label v-if="mode === 'register'">Your full name<input v-model="form.name" required minlength="2" maxlength="100" placeholder="Avery Morgan"/></label>
          <label>Email address<input v-model="form.email" required type="email" autocomplete="email" placeholder="you@company.com"/></label>
          <label>Password<input v-model="form.password" required type="password" :minlength="mode === 'register' ? 12 : 1" maxlength="128" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" placeholder="Enter your password"/></label>
          <p v-if="mode === 'register'" class="field-hint">Use at least 12 characters, including uppercase, lowercase, and a number.</p>
          <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
          <button class="primary-button" type="submit" :disabled="auth.busy">{{ auth.busy ? 'Please wait…' : mode === 'login' ? 'Sign in securely' : 'Create workspace' }}</button>
        </form>
        <p class="auth-footnote">Protected sessions · Organization-scoped accounts</p>
      </section>
    </section>
    <footer><span>CONTRACTSPHERE</span><span>SECURE BY DESIGN · BUILT FOR ENTERPRISE</span></footer>
  </main>
</template>
