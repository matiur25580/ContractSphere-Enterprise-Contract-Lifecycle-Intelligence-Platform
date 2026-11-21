import { spawn } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.SCREENSHOT_BASE_URL || "http://127.0.0.1:5173";
const output = "docs/screenshots";
const server = spawn("npm", ["run", "dev:web"], { stdio: "ignore", shell: process.platform === "win32" });
const id = "64b000000000000000000001";
const contract2 = "64b000000000000000000002";
const contract3 = "64b000000000000000000003";
const userId = "64a000000000000000000001";
const contracts = [
 { _id:id,title:"Enterprise Cloud Services Agreement",contractNumber:"MSA-2026-014",type:"MSA",status:"EXECUTED",counterparty:"Northstar Digital Systems",currency:"USD",contractValue:285000,latestVersion:4,latestDocumentId:"64c000000000000000000001",updatedAt:"2026-11-18T10:00:00.000Z" },
 { _id:contract2,title:"Data Processing Addendum",contractNumber:"DPA-2026-009",type:"DPA",status:"IN_REVIEW",counterparty:"Meridian Analytics",currency:"USD",contractValue:92000,latestVersion:2,latestDocumentId:"64c000000000000000000002",updatedAt:"2026-11-16T10:00:00.000Z" },
 { _id:contract3,title:"Strategic Supplier Statement of Work",contractNumber:"SOW-2026-021",type:"SOW",status:"DRAFT",counterparty:"Vertex Operations",currency:"INR",contractValue:6400000,latestVersion:1,latestDocumentId:"64c000000000000000000003",updatedAt:"2026-11-14T10:00:00.000Z" }
];
const obligations = [
 {_id:"64d000000000000000000001",title:"Quarterly security assurance report",type:"COMPLIANCE",status:"IN_PROGRESS",priority:"HIGH",dueDate:"2026-12-05T00:00:00.000Z",contractId:{title:contracts[0].title,contractNumber:contracts[0].contractNumber},ownerId:{name:"Avery Morgan"}},
 {_id:"64d000000000000000000002",title:"November platform service invoice",type:"PAYMENT",status:"OVERDUE",priority:"CRITICAL",dueDate:"2026-11-12T00:00:00.000Z",contractId:{title:contracts[1].title,contractNumber:contracts[1].contractNumber},ownerId:{name:"Jordan Lee"}},
 {_id:"64d000000000000000000003",title:"Annual penetration test evidence",type:"DELIVERABLE",status:"PENDING",priority:"MEDIUM",dueDate:"2027-01-15T00:00:00.000Z",contractId:{title:contracts[2].title,contractNumber:contracts[2].contractNumber},ownerId:{name:"Avery Morgan"}}
];
const renewals = [
 {_id:"64e000000000000000000001",expiryDate:"2027-01-20T00:00:00.000Z",noticeDeadline:"2026-12-21T00:00:00.000Z",noticePeriodDays:30,renewalType:"AUTO",status:"UPCOMING",contractId:{title:contracts[0].title,contractNumber:contracts[0].contractNumber,counterparty:contracts[0].counterparty}},
 {_id:"64e000000000000000000002",expiryDate:"2026-12-15T00:00:00.000Z",noticeDeadline:"2026-11-25T00:00:00.000Z",noticePeriodDays:20,renewalType:"MANUAL",status:"NOTICE_DUE",contractId:{title:contracts[1].title,contractNumber:contracts[1].contractNumber,counterparty:contracts[1].counterparty}}
];
const vendors = [
 {_id:"64f000000000000000000001",legalName:"Northstar Digital Systems Pvt Ltd",displayName:"Northstar Digital",category:"SERVICE_PROVIDER",status:"ACTIVE",country:"India",industry:"Cloud infrastructure",riskLevel:"MEDIUM",riskScore:42,contacts:[{name:"Priya Shah",email:"priya@northstar.example",primary:true}],certifications:[{name:"ISO 27001",status:"ACTIVE"},{name:"SOC 2 Type II",status:"ACTIVE"}]},
 {_id:"64f000000000000000000002",legalName:"Meridian Analytics Ltd",displayName:"Meridian Analytics",category:"SUPPLIER",status:"ACTIVE",country:"Singapore",industry:"Data analytics",riskLevel:"HIGH",riskScore:74,contacts:[{name:"Daniel Tan",email:"daniel@meridian.example",primary:true}],certifications:[{name:"SOC 2 Type II",status:"EXPIRING"}]}
];
const templates = [
 {_id:"650000000000000000000001",name:"Mutual Non-Disclosure Agreement",contractType:"NDA",version:3,status:"APPROVED",fields:[{key:"effectiveDate",label:"Effective date",type:"DATE",required:true,options:[]}],sections:[{heading:"Confidentiality",content:"Approved mutual confidentiality terms."}]},
 {_id:"650000000000000000000002",name:"Data Processing Addendum",contractType:"DPA",version:2,status:"PENDING_APPROVAL",fields:[{key:"jurisdiction",label:"Jurisdiction",type:"CHOICE",required:true,options:["India","Singapore","England"]}],sections:[{heading:"Data protection",content:"Controller and processor obligations."}]}
];
const clauses = [
 {_id:"651000000000000000000001",key:"confidentiality",title:"Mutual confidentiality",category:"Confidentiality",body:"Each party shall protect confidential information using reasonable safeguards and disclose it only to authorized recipients.",version:4},
 {_id:"651000000000000000000002",key:"liability-cap",title:"Limitation of liability",category:"Risk allocation",body:"Subject to agreed exclusions, aggregate liability is capped at fees paid in the preceding twelve months.",version:2}
];
const report = { _id:"652000000000000000000001",engine:"RULE_BASED",summary:"Reviewed 8,420 characters. Detected 8 of 10 clause categories and 3 review flags.",findings:[
 {key:"uncapped_liability",title:"Potential uncapped liability",category:"LIABILITY",severity:"CRITICAL",confidence:.96,explanation:"The source expressly refers to unlimited liability. Confirm whether an appropriate cap and negotiated exclusions apply.",evidence:{excerpt:"The supplier's liability under this agreement shall be unlimited.",start:2840,end:2912}},
 {key:"renewal_notice_unclear",title:"Automatic renewal notice is unclear",category:"RENEWAL",severity:"MEDIUM",confidence:.78,explanation:"Automatic renewal wording was detected without a clear notice mechanism.",evidence:{excerpt:"This agreement will automatically renew for successive one-year terms.",start:5100,end:5170}}
 ],extractedClauses:[{key:"confidentiality",label:"Confidentiality",found:true},{key:"liability",label:"Limitation of liability",found:true},{key:"indemnity",label:"Indemnification",found:true},{key:"termination",label:"Termination",found:true},{key:"governing_law",label:"Governing law",found:true},{key:"disputes",label:"Dispute resolution",found:true},{key:"payment",label:"Payment terms",found:true},{key:"data_protection",label:"Data protection",found:true},{key:"renewal",label:"Renewal",found:true},{key:"force_majeure",label:"Force majeure",found:false}],missingTerms:["Force majeure"],riskCounts:{CRITICAL:1,HIGH:0,MEDIUM:1,LOW:1},createdAt:"2026-11-21T10:00:00.000Z"};
const comparison = {_id:"653000000000000000000001",baselineLabel:"Earlier version",candidateLabel:"Proposed version",similarityScore:86,summary:"Compared Earlier version with Proposed version: 1 clause category added, 0 removed, 2 text additions and 1 removal captured. 1 new or elevated risk signals require review.",clauseChanges:[{key:"liability",label:"Limitation of liability",change:"ADDED",baselineEvidence:null,candidateEvidence:"The supplier's liability under this agreement shall be unlimited."}],findingChanges:[{key:"uncapped_liability",title:"Potential uncapped liability",change:"NEW",baselineSeverity:null,candidateSeverity:"CRITICAL"}],additions:[{excerpt:"The supplier's liability under this agreement shall be unlimited."},{excerpt:"This agreement will automatically renew for successive one-year terms."}],removals:[{excerpt:"The supplier's aggregate liability shall not exceed fees paid in the preceding twelve months."}],createdAt:"2026-11-21T10:00:00.000Z"};
function ok(data) { return { success: true, data }; }
async function waitForServer(url, child) {
 for (let attempt = 0; attempt < 120; attempt += 1) {
  if (child.exitCode !== null) throw new Error("Vite exited before the dashboard became available.");
  try { const response = await fetch(url); if (response.ok) return; } catch {}
  await new Promise(resolve => setTimeout(resolve, 500));
 }
 throw new Error("Vite did not become ready within 60 seconds.");
}
async function main() {
 await mkdir(output, { recursive: true });
 for (const file of await readdir(output)) if (file.endsWith(".png")) await rm(output + "/" + file, { force: true });
 await waitForServer(baseUrl, server);
 const browser = await chromium.launch({ headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await page.route("**/api/v1/**", async route => {
   const request = route.request();
   const url = new URL(request.url());
   const path = url.pathname.replace("/api/v1", "");
   let data = {};
   if (path === "/auth/refresh") data = { accessToken: "showcase-access-token", user: { id:userId,name:"Avery Morgan",email:"avery@example.test",role:"OWNER",organization:{id:"64a000000000000000000002",name:"Northstar Legal Operations",slug:"northstar-legal"} } };
   else if (path === "/contracts") data = { items:contracts,pagination:{page:1,limit:50,total:3,pages:1} };
   else if (path === "/workflows/definitions") data = { definitions:[{_id:"654000000000000000000001",name:"Enterprise contract governance",stages:[{name:"Legal review",approvalMode:"ALL",approverUserIds:[userId]},{name:"Finance & risk",approvalMode:"ANY",approverUserIds:[userId]}]}] };
   else if (path === "/workflows/tasks/mine") data = { tasks:[{_id:"655000000000000000000001",definitionName:"Enterprise contract governance",currentStage:{name:"Legal review",approvalMode:"ALL",approverUserIds:[userId]},contract:{title:contracts[1].title,contractNumber:contracts[1].contractNumber,counterparty:contracts[1].counterparty}}] };
   else if (path === "/obligations") data = { items:obligations };
   else if (path === "/obligations/renewals") data = { items:renewals,summary:{upcoming:1,noticeDue:1,inProgress:0,expired:0} };
   else if (path === "/vendors") data = { items:vendors };
   else if (path === "/notifications") data = { items:[{_id:"656000000000000000000001",type:"APPROVAL_REQUIRED",title:"Contract approval assigned",body:"DPA-2026-009 is waiting for your legal review.",link:"/contracts/64b000000000000000000002",readAt:null,createdAt:"2026-11-21T09:30:00.000Z"}],unread:1 };
   else if (path === "/templates") data = { templates };
   else if (path === "/templates/clauses") data = { clauses };
   else if (path.endsWith("/intelligence/analyze")) data = { report };
   else if (path.endsWith("/intelligence/compare")) data = { comparison };
   await route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(ok(data)) });
  });
  await page.goto(baseUrl, { waitUntil:"networkidle" });
  await page.waitForSelector(".workspace-heading", { timeout:30000 });
  await page.locator(`.intelligence-panel select option[value="${id}"]`).waitFor({ state:"attached", timeout:30000 });
  const contractSelect = page.locator(".intelligence-panel select").first();
  await contractSelect.selectOption(id);
  await contractSelect.dispatchEvent("input");
  await contractSelect.dispatchEvent("change");
  const source = "This Master Services Agreement is entered into by the parties. The parties agree to confidentiality obligations and shall protect personal data. This agreement is governed by the laws of England. The supplier shall maintain insurance and indemnify the customer for all claims. This agreement will automatically renew for successive one-year terms. The supplier's liability under this agreement shall be unlimited. The parties agree to payment terms and termination rights.";
  const sourceLabelInput = page.locator(".intelligence-panel form input").first();
  await sourceLabelInput.fill("Enterprise services agreement — showcase fixture");
  await sourceLabelInput.dispatchEvent("input");
  await sourceLabelInput.dispatchEvent("change");
  const sourceTextarea = page.locator(".intelligence-panel form textarea").first();
  await sourceTextarea.fill(source);
  await sourceTextarea.dispatchEvent("input");
  await sourceTextarea.dispatchEvent("change");
  // Vue's v-model can lag behind programmatic browser input in headless CI.
  // Set the component's public reactive state as a deterministic fallback so
  // this screenshot fixture tests the dashboard rather than browser event quirks.
  await page.evaluate(async ({ contractId, sourceText }) => {
   const instance = document.querySelector("#app")?.__vue_app__?._instance;
   const dashboard = instance?.proxy;
   if (!dashboard) throw new Error("Could not access the mounted Vue dashboard instance.");
   dashboard.intelligenceContractId = contractId;
   dashboard.intelligenceSourceLabel = "Enterprise services agreement — showcase fixture";
   dashboard.intelligenceSource = sourceText;
   await dashboard.$nextTick();
  }, { contractId: id, sourceText: source });
  await page.waitForTimeout(250);
  const selectedContract = await page.locator(".intelligence-panel select").first().inputValue();
  const sourceLength = await page.locator(".intelligence-panel form textarea").first().inputValue().then(value => value.trim().length);
  const submitDisabled = await page.locator(".intelligence-panel form button[type=submit]").first().isDisabled();
  const reactiveDebug = await page.evaluate(() => { const state = document.querySelector("#app")?.__vue_app__?._instance?.setupState; return { contractId: state?.intelligenceContractId, sourceLength: state?.intelligenceSource?.trim?.().length, sourceLabel: state?.intelligenceSourceLabel, analyzing: state?.analyzingContract, buttonDisabled: document.querySelector(".intelligence-panel form button[type=submit]")?.disabled }; });
  process.stdout.write(`Showcase debug: contract=${selectedContract}, sourceLength=${sourceLength}, submitDisabled=${submitDisabled}, reactive=${JSON.stringify(reactiveDebug)}\\n`);
  await page.waitForFunction(() => { const button = document.querySelector(".intelligence-panel form button[type=submit]"); return button instanceof HTMLButtonElement && !button.disabled; }, null, { timeout:10000 });
  await page.locator(".intelligence-panel form button[type=submit]").first().click();
  await page.waitForSelector(".intelligence-results");
  const compareForm = page.locator(".comparison-workspace form");
  await compareForm.locator("textarea").nth(0).fill(source.replace("The supplier's liability under this agreement shall be unlimited.", "The supplier's aggregate liability shall not exceed fees paid in the preceding twelve months."));
  await compareForm.locator("textarea").nth(1).fill(source);
  await compareForm.locator("button[type=submit]").click();
  await page.waitForSelector(".comparison-results");
  const shots = [
   ["01-executive-workspace.png",".workspace-heading"],
   ["02-contract-portfolio.png",".workspace > .metric-grid:not(.lifecycle-metrics)"],
   ["03-lifecycle-performance.png",".lifecycle-metrics"],
   ["04-evidence-grounded-contract-review.png",".intelligence-panel"],
   ["05-version-comparison.png",".comparison-workspace"],
   ["06-approval-governance.png",".workflow-grid"],
   ["07-obligation-management.png",".obligation-grid .workflow-panel:first-child"],
   ["08-renewal-calendar.png",".obligation-grid .workflow-panel:nth-child(2)"],
   ["09-template-and-clause-governance.png",".template-grid"],
   ["10-third-party-risk.png",".vendor-grid"],
   ["11-contract-intake.png",".create-panel"],
   ["12-searchable-repository.png",".list-panel"]
  ];
  for (const [name, selector] of shots) {
   const target = page.locator(selector);
   await target.waitFor({ state:"visible" });
   await target.screenshot({ path: output + "/" + name, animations:"disabled" });
   process.stdout.write("Captured " + name + "\n");
  }
 } finally {
  await browser.close();
  server.kill("SIGTERM");
 }
}
main().catch(error => { process.stderr.write(String(error?.stack || error)); process.exitCode = 1; server.kill("SIGTERM"); });
