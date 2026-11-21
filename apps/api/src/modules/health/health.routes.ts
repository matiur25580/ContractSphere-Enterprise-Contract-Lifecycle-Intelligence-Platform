import { Router } from "express";
import mongoose from "mongoose";

export const healthRouter = Router();

export function getReadinessSnapshot(databaseReady: boolean) {
  return {
    status: databaseReady ? "ready" : "not_ready",
    checks: { database: databaseReady ? "connected" : "disconnected" }
  };
}

healthRouter.get("/", (_req, res) => {
  res.status(200).json({ success: true, data: { status: "ok", service: "contractsphere-api", timestamp: new Date().toISOString() } });
});
healthRouter.get("/live", (_req, res) => {
  res.status(200).json({ success: true, data: { status: "alive", service: "contractsphere-api", timestamp: new Date().toISOString() } });
});
healthRouter.get("/ready", (_req, res) => {
  const snapshot = getReadinessSnapshot(mongoose.connection.readyState === 1);
  res.status(snapshot.status === "ready" ? 200 : 503).json({ success: snapshot.status === "ready", data: snapshot });
});
