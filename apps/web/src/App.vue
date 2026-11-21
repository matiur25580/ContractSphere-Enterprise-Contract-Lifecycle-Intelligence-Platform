<script setup lang="ts">
import {ref} from "vue";
const apiStatus=ref<"checking"|"online"|"offline">("checking");
fetch("/api/v1/health").then(response=>{if(!response.ok)throw new Error("API unavailable");apiStatus.value="online";}).catch(()=>{apiStatus.value="offline";});
</script>
<template>
  <main class="shell">
    <nav class="topbar"><a class="brand" href="/"><span class="brand-mark">C</span><span>Contract<span class="brand-light">Sphere</span></span></a><span class="environment">FOUNDATION PREVIEW</span></nav>
    <section class="hero">
      <div class="eyebrow"><span class="pulse"></span> CONTRACT LIFECYCLE INTELLIGENCE</div>
      <h1>Agreements deserve<br/><span>better intelligence.</span></h1>
      <p class="intro">One secure workspace to manage contracts from first draft to final obligation. Built for legal, procurement, finance, and the teams moving business forward.</p>
      <div class="status-card"><div><span class="status-label">PLATFORM STATUS</span><strong>Core foundation initialized</strong></div><span class="status-pill" :class="apiStatus"><i></i>{{apiStatus==="checking"?"Checking API":apiStatus==="online"?"API connected":"API offline"}}</span></div>
    </section>
    <section class="capabilities"><div class="section-heading"><span class="eyebrow">PLATFORM MODULES</span><h2>From agreement to advantage.</h2></div>
      <div class="module-grid">
        <article class="module-card"><span>01</span><h3>Contract repository</h3><p>Centralized agreements, controlled documents, and version history.</p></article>
        <article class="module-card"><span>02</span><h3>Approval workflows</h3><p>Structured reviews, delegated decisions, and SLA visibility.</p></article>
        <article class="module-card"><span>03</span><h3>Contract intelligence</h3><p>Evidence-backed clause extraction, summaries, and risk signals.</p></article>
        <article class="module-card"><span>04</span><h3>Obligations &amp; renewals</h3><p>Track commitments, critical dates, owners, and renewal windows.</p></article>
      </div>
    </section>
    <footer><span>CONTRACTSPHERE</span><span>SECURE BY DESIGN · BUILT FOR ENTERPRISE</span></footer>
  </main>
</template>
