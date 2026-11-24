import { Obligation } from "./obligation.model.js";
import { Renewal } from "./renewal.model.js";
import { createUserNotification } from "../notifications/notification.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_MS = 60 * 60 * 1000;
let timer: NodeJS.Timeout | undefined;
let running = false;
let stopping = false;

export function getObligationReminderType(dueDate: Date, now = new Date()) {
  return dueDate.getTime() < now.getTime() ? "OBLIGATION_OVERDUE" : "OBLIGATION_DUE_SOON";
}
export function getRenewalReminderType(noticeDeadline: Date, now = new Date()) {
  return noticeDeadline.getTime() < now.getTime() ? "RENEWAL_NOTICE_OVERDUE" : "RENEWAL_NOTICE_DUE";
}
function dayKey(value: Date) { return value.toISOString().slice(0, 10); }

// Sweep bounded sets of upcoming obligations and renewals; notification dedupe keys prevent repeat alerts.
export async function runReminderSweep(now = new Date()) {
  const obligationCutoff = new Date(now.getTime() + 3 * DAY_MS);
  const renewalCutoff = new Date(now.getTime() + 7 * DAY_MS);
  const [obligations, renewals] = await Promise.all([
    Obligation.find({ dueDate: { $lte: obligationCutoff }, status: { $nin: ["COMPLETED", "CANCELLED"] } })
      .select("tenantId contractId ownerId title dueDate status").limit(1000).lean(),
    Renewal.find({ noticeDeadline: { $lte: renewalCutoff }, expiryDate: { $gt: now }, status: { $nin: ["RENEWED", "TERMINATED", "EXPIRED"] } })
      .select("tenantId contractId ownerId noticeDeadline expiryDate status").limit(1000).lean()
  ]);
  const tasks = [
    ...obligations.map(item => {
      const overdue = item.dueDate.getTime() < now.getTime();
      const type = getObligationReminderType(item.dueDate, now);
      return createUserNotification({
        tenantId: item.tenantId.toString(), userId: item.ownerId.toString(), type,
        title: overdue ? "Obligation is overdue" : "Obligation due soon",
        body: overdue ? `“${item.title}” is past its due date. Review the commitment and update its status.` : `“${item.title}” is due within three days. Review the commitment and plan completion.`,
        link: `/contracts/${item.contractId.toString()}`,
        dedupeKey: `reminder:obligation:${item._id.toString()}:${dayKey(item.dueDate)}:${overdue ? "overdue" : "due-soon"}`
      });
    }),
    ...renewals.map(item => {
      const overdue = item.noticeDeadline.getTime() < now.getTime();
      const type = getRenewalReminderType(item.noticeDeadline, now);
      return createUserNotification({
        tenantId: item.tenantId.toString(), userId: item.ownerId.toString(), type,
        title: overdue ? "Renewal notice deadline passed" : "Renewal notice deadline approaching",
        body: overdue ? "The contract renewal notice deadline has passed. Review the renewal decision immediately." : "The contract renewal notice deadline is within seven days. Review renewal, renegotiation, or termination options.",
        link: `/contracts/${item.contractId.toString()}`,
        dedupeKey: `reminder:renewal:${item._id.toString()}:${dayKey(item.noticeDeadline)}:${overdue ? "overdue" : "due-soon"}`
      });
    })
  ];
  const results = await Promise.allSettled(tasks);
  const failed = results.filter(result => result.status === "rejected").length;
  if (failed) console.error(`Reminder sweep completed with ${failed} notification failures.`);
  return { obligations: obligations.length, renewals: renewals.length, failed };
}

async function tick() {
  if (stopping || running) return schedule();
  running = true;
  try { await runReminderSweep(); }
  catch (error) { console.error("Reminder scheduler error:", error); }
  finally { running = false; schedule(); }
}
function schedule() {
  if (stopping) return;
  timer = setTimeout(() => { void tick(); }, SWEEP_MS);
  timer.unref();
}
export function startReminderScheduler() {
  if (timer || stopping) return;
  console.info("Obligation and renewal reminder scheduler started.");
  void tick();
}
export async function stopReminderScheduler() {
  stopping = true;
  if (timer) clearTimeout(timer);
  while (running) await new Promise(resolve => setTimeout(resolve, 50));
  console.info("Obligation and renewal reminder scheduler stopped.");
}
