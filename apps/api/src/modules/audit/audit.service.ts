import { Types } from "mongoose";
import { AuditEvent } from "./audit.model.js";

const oid = (value: string) => new Types.ObjectId(value);

export async function recordAuditEvent(input: {
  tenantId: string; actorId: string; action: string; resourceType: string;
  resourceId: string; summary: string; metadata?: Record<string, string | number | boolean | null>;
  requestId?: string;
}) {
  return AuditEvent.create({
    tenantId: oid(input.tenantId), actorId: oid(input.actorId), action: input.action,
    resourceType: input.resourceType, resourceId: input.resourceId, summary: input.summary,
    metadata: input.metadata ?? {}, requestId: input.requestId
  });
}

export async function listAuditEvents(tenantId: string, query: {
  resourceType?: string | undefined; action?: string | undefined; resourceId?: string | undefined; page: number; limit: number;
}) {
  const filter: Record<string, unknown> = { tenantId: oid(tenantId) };
  if (query.resourceType) filter.resourceType = query.resourceType;
  if (query.action) filter.action = query.action;
  if (query.resourceId) filter.resourceId = query.resourceId;
  const [items, total] = await Promise.all([
    AuditEvent.find(filter).sort({ occurredAt: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit)
      .populate("actorId", "name email").lean(),
    AuditEvent.countDocuments(filter)
  ]);
  return { items, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}
